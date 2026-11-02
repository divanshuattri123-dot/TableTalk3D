using System;
using System.Collections.Generic;
using System.Collections;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

namespace TableTalk.Editor
{
    public static class BoardWorldAssets
    {
        static IEnumerator capture;
        static int captureFrame=-1;
        public static void StartCapture()
        {
            capture=CaptureThumbnails();captureFrame=-1;
            EditorApplication.update-=CaptureStep;EditorApplication.update+=CaptureStep;
        }
        static void CaptureStep()
        {
            if(!Application.isPlaying||capture==null){EditorApplication.update-=CaptureStep;return;}
            if(Time.frameCount==captureFrame)return;captureFrame=Time.frameCount;
            try{if(!capture.MoveNext()){capture=null;EditorApplication.update-=CaptureStep;}}
            catch(Exception exception){capture=null;EditorApplication.update-=CaptureStep;Debug.LogException(exception);}
        }
        public static string Build()
        {
            var project=Directory.GetParent(Application.dataPath).FullName;
            var input=Path.Combine(project,"tmp/world-import");
            const string art="Assets/TableTalk/Worlds",resources="Assets/TableTalk/Resources/BoardWorlds";
            Directory.CreateDirectory(art);Directory.CreateDirectory(resources);
            foreach(var png in Directory.GetFiles(input,"*.png"))File.Copy(png,art+"/"+Path.GetFileName(png),true);
            AssetDatabase.Refresh();
            foreach(var png in Directory.GetFiles(art,"*.png"))
            {
                var importer=(TextureImporter)AssetImporter.GetAtPath(png.Replace('\\','/'));
                importer.sRGBTexture=true;importer.maxTextureSize=1024;importer.wrapMode=TextureWrapMode.Clamp;
                importer.filterMode=FilterMode.Bilinear;importer.textureCompression=TextureImporterCompression.Uncompressed;importer.SaveAndReimport();
            }
            int total=0;
            for(int index=1;index<=10;index++)
            {
                var id="theme"+index.ToString("000");var root=new GameObject(id);
                var materials=new Dictionary<string,Material>();
                var groups=new Dictionary<Material,List<Mesh>>();
                using(var reader=new BinaryReader(File.OpenRead(Path.Combine(input,id+".bytes"))))
                {
                    if(reader.ReadUInt32()!=0x54545731)throw new InvalidDataException("Unknown world mesh format");
                    int count=reader.ReadInt32();
                    for(int part=0;part<count;part++)
                    {
                        string name=ReadString(reader),texture=ReadString(reader);
                        var tint=new Color(reader.ReadSingle(),reader.ReadSingle(),reader.ReadSingle(),reader.ReadSingle());
                        int vertices=reader.ReadInt32(),indices=reader.ReadInt32();
                        var mesh=new Mesh{name=name,indexFormat=vertices>65535?IndexFormat.UInt32:IndexFormat.UInt16};
                        var points=new Vector3[vertices];var normals=new Vector3[vertices];var uv=new Vector2[vertices];var light=new Vector2[vertices];
                        for(int n=0;n<vertices;n++)points[n]=new Vector3(reader.ReadSingle(),reader.ReadSingle(),reader.ReadSingle());
                        for(int n=0;n<vertices;n++)normals[n]=new Vector3(reader.ReadSingle(),reader.ReadSingle(),reader.ReadSingle()).normalized;
                        for(int n=0;n<vertices;n++)uv[n]=new Vector2(reader.ReadSingle(),reader.ReadSingle());
                        for(int n=0;n<vertices;n++)light[n]=new Vector2(reader.ReadSingle(),reader.ReadSingle());
                        var triangles=new int[indices];for(int n=0;n<indices;n++)triangles[n]=reader.ReadInt32();
                        mesh.vertices=points;mesh.normals=normals;mesh.uv=uv;mesh.uv2=light;mesh.triangles=triangles;mesh.RecalculateBounds();
                        string materialKey=texture+"-"+tint;
                        if(!materials.TryGetValue(materialKey,out var material))
                        {
                            string materialPath=$"{art}/{id}-material-{materials.Count:000}.mat";
                            material=AssetDatabase.LoadAssetAtPath<Material>(materialPath);
                            if(material==null){material=new Material(Shader.Find("TableTalk/City Surface"));AssetDatabase.CreateAsset(material,materialPath);}
                            var palette=string.IsNullOrEmpty(texture)?null:AssetDatabase.LoadAssetAtPath<Texture2D>(art+"/"+texture);
                            if(!string.IsNullOrEmpty(texture)&&palette==null)throw new InvalidDataException("Missing source palette "+texture);
                            material.SetTexture("_BaseMap",palette);
                            material.SetColor("_BaseColor",palette!=null?Color.white:tint);material.SetFloat("_OcclusionStrength",0);material.SetFloat("_Cull",0);material.enableInstancing=true;
                            EditorUtility.SetDirty(material);materials[materialKey]=material;
                        }
                        if(!groups.TryGetValue(material,out var meshes)){meshes=new List<Mesh>();groups[material]=meshes;}
                        meshes.Add(mesh);
                        total+=indices/3;
                    }
                }
                int groupIndex=0;
                foreach(var group in groups)
                {
                    var instances=new CombineInstance[group.Value.Count];
                    for(int n=0;n<instances.Length;n++)instances[n]=new CombineInstance{mesh=group.Value[n],transform=Matrix4x4.identity};
                    var combined=new Mesh{name=id+" surface",indexFormat=IndexFormat.UInt32};combined.CombineMeshes(instances,true,true);
                    foreach(var mesh in group.Value)UnityEngine.Object.DestroyImmediate(mesh);
                    MeshUtility.SetMeshCompression(combined,ModelImporterMeshCompression.Medium);
                    string path=$"{art}/{id}-surface-{groupIndex++:000}.asset";
                    var previous=AssetDatabase.LoadAssetAtPath<Mesh>(path);
                    if(previous!=null){EditorUtility.CopySerialized(combined,previous);UnityEngine.Object.DestroyImmediate(combined);combined=previous;}else AssetDatabase.CreateAsset(combined,path);
                    var child=new GameObject(combined.name,typeof(MeshFilter),typeof(MeshRenderer));child.transform.SetParent(root.transform,false);
                    child.GetComponent<MeshFilter>().sharedMesh=combined;child.GetComponent<MeshRenderer>().sharedMaterial=group.Key;
                }
                PrefabUtility.SaveAsPrefabAsset(root,resources+"/"+id+".prefab");UnityEngine.Object.DestroyImmediate(root);
            }
            AssetDatabase.SaveAssets();return "Built ten alternate native worlds, "+total+" triangles; Classic City preserved.";
        }
        static string ReadString(BinaryReader reader)=>Encoding.UTF8.GetString(reader.ReadBytes(reader.ReadInt32()));

        public static IEnumerator CaptureThumbnails()
        {
            var presentation=UnityEngine.Object.FindFirstObjectByType<TableTalkPresentation>();
            if(!Application.isPlaying||presentation==null)throw new InvalidOperationException("Start the scene before rendering map previews.");
            presentation.BeginWeb();
            var state=JsonUtility.FromJson<BoardSnapshot>(presentation.previewSnapshot.text);
            state.roomCode="STUDIO";
            string output=Path.Combine(Directory.GetParent(Application.dataPath).FullName,"Browser/public/art/worlds");Directory.CreateDirectory(output);
            var cameraObject=new GameObject("Map thumbnail camera",typeof(Camera));var camera=cameraObject.GetComponent<Camera>();
            camera.CopyFrom(presentation.boardCamera);camera.enabled=false;camera.orthographic=true;camera.orthographicSize=6.5f;
            camera.transform.position=new Vector3(0,13,-8);camera.transform.LookAt(new Vector3(0,.5f,0));camera.aspect=1;
            for(int n=0;n<=10;n++)
            {
                state.world="theme"+n.ToString("000");presentation.ResetSnapshot(JsonUtility.ToJson(state));
                presentation.SetVisualSettings("{\"quality\":\"high\",\"theme\":\"day\",\"camera\":\"top\",\"reducedMotion\":true}");
                yield return null;yield return null;
                var target=RenderTexture.GetTemporary(512,512,24,RenderTextureFormat.ARGB32);
                RenderPipeline.SubmitRenderRequest(camera,new RenderPipeline.StandardRequest{destination=target});
                var previous=RenderTexture.active;RenderTexture.active=target;
                var texture=new Texture2D(512,512,TextureFormat.RGB24,false);texture.ReadPixels(new Rect(0,0,512,512),0,0);texture.Apply();
                File.WriteAllBytes(Path.Combine(output,state.world+".jpg"),texture.EncodeToJPG(90));
                UnityEngine.Object.Destroy(texture);RenderTexture.active=previous;RenderTexture.ReleaseTemporary(target);
            }
            UnityEngine.Object.Destroy(cameraObject);
            state.world="theme000";presentation.ResetSnapshot(JsonUtility.ToJson(state));
            File.WriteAllText(Path.Combine(output,"verification.json"),Verify());
        }

        public static string Verify()
        {
            var results=new List<string>();
            for(int index=1;index<=10;index++)
            {
                var id="theme"+index.ToString("000");var prefab=Resources.Load<GameObject>("BoardWorlds/"+id);
                if(prefab==null)throw new InvalidOperationException("Missing bundled map "+id);
                var meshes=prefab.GetComponentsInChildren<MeshFilter>();int triangles=0;
                foreach(var filter in meshes)
                {
                    var mesh=filter.sharedMesh;if(mesh==null||mesh.vertexCount<3)throw new InvalidOperationException("Empty map mesh "+id);
                    for(int sub=0;sub<mesh.subMeshCount;sub++)triangles+=(int)mesh.GetIndexCount(sub)/3;
                    if(mesh.bounds.size.x>1.02f||mesh.bounds.size.z>1.02f)throw new InvalidOperationException("Map geometry overlaps board tiles: "+id);
                    if(!filter.GetComponent<Renderer>().sharedMaterial.HasProperty("_BaseMap"))throw new InvalidOperationException("Unsupported map material "+id);
                }
                results.Add("{\"id\":\""+id+"\",\"meshes\":"+meshes.Length+",\"triangles\":"+triangles+"}");
            }
            return "["+string.Join(",",results)+"]";
        }
    }
}
