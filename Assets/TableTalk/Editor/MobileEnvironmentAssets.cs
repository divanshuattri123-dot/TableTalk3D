using System;
using System.Linq;
using Unity.Collections;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace TableTalk.Editor
{
    public static class MobileEnvironmentAssets
    {
        public static string Prepare()
        {
            if(EditorApplication.isPlaying)throw new InvalidOperationException("Prepare saved art outside Play mode.");
            var game=UnityEngine.Object.FindFirstObjectByType<TableTalkPresentation>();
            var token=game.tokens.First(t=>t.id=="m-a9fe918d9d51ea81");
            var source=token.prefab.GetComponentInChildren<MeshFilter>().sharedMesh;
            const string path="Assets/TableTalk/Art/TrafficCarSurface.asset";
            var mesh=AssetDatabase.LoadAssetAtPath<Mesh>(path);
            if(mesh==null)
            {
                // Read the supplied mesh in the editor; only this small traffic copy needs CPU data.
                using(var data=MeshUtility.AcquireReadOnlyMeshData(source))
                {
                    var read=data[0];var write=Mesh.AllocateWritableMeshData(1);var output=write[0];
                    output.SetVertexBufferParams(read.vertexCount,source.GetVertexAttributes());
                    for(int stream=0;stream<source.vertexBufferCount;stream++)output.GetVertexData<byte>(stream).CopyFrom(read.GetVertexData<byte>(stream));
                    int count=(int)Enumerable.Range(0,source.subMeshCount).Sum(i=>(long)source.GetIndexCount(i));
                    output.SetIndexBufferParams(count,source.indexFormat);
                    if(source.indexFormat==IndexFormat.UInt16)output.GetIndexData<ushort>().CopyFrom(read.GetIndexData<ushort>());
                    else output.GetIndexData<uint>().CopyFrom(read.GetIndexData<uint>());
                    output.subMeshCount=read.subMeshCount;
                    for(int i=0;i<read.subMeshCount;i++)output.SetSubMesh(i,read.GetSubMesh(i));
                    mesh=new Mesh{name="Shared readable traffic sports car"};Mesh.ApplyAndDisposeWritableMeshData(write,mesh);mesh.bounds=source.bounds;
                }
                AssetDatabase.CreateAsset(mesh,path);
            }
            game.trafficCarMesh=mesh;EditorUtility.SetDirty(game);EditorSceneManager.MarkSceneDirty(game.gameObject.scene);
            AssetDatabase.SaveAssets();EditorSceneManager.SaveScene(game.gameObject.scene);
            return $"Saved shared traffic source: {mesh.vertexCount} vertices, {mesh.triangles.Length/3} triangles; original token asset unchanged.";
        }

        public static string Verify()
        {
            if(!Application.isPlaying)throw new InvalidOperationException("Run in the disposable STUDIO preview.");
            var game=UnityEngine.Object.FindFirstObjectByType<TableTalkPresentation>();
            var flags=System.Reflection.BindingFlags.Instance|System.Reflection.BindingFlags.NonPublic;
            var state=(BoardSnapshot)game.GetType().GetField("shown",flags).GetValue(game);
            if(state.roomCode!="STUDIO")throw new InvalidOperationException("Only a STUDIO preview may be tested.");
            var meshes=(System.Collections.Generic.Dictionary<Mesh,Mesh>)game.GetType().GetField("trafficSurfaces",flags).GetValue(game);
            if(meshes.Count!=1)throw new Exception("Traffic must share one surface mesh.");
            var pair=meshes.First();var counts=Enumerable.Range(0,4).Select(i=>pair.Value.GetIndexCount(i)).ToArray();
            if(counts.Sum(n=>(long)n)!=pair.Key.triangles.Length||counts.Take(3).Any(n=>n==0))throw new Exception("Traffic lost triangles or is missing paint, glazing or tyres.");
            var leaves=(System.Collections.Generic.List<Material>)game.GetType().GetField("foliageInstances",flags).GetValue(game);
            if(leaves.Count!=4||leaves.Any(m=>m.shader!=game.treeFoliage.shader||m.mainTexture==null))throw new Exception("Saved foliage art is missing from a canopy batch.");
            game.SetVisualSettings("{\"quality\":\"auto\",\"mobile\":true,\"reducedMotion\":true}");
            if(leaves.Any(m=>m.GetFloat("_LeafWindStrength")!=0))throw new Exception("Reduced motion left foliage wind running.");
            game.SetVisualSettings("{\"quality\":\"auto\",\"mobile\":true,\"reducedMotion\":false}");
            if(leaves.Any(m=>m.GetFloat("_LeafWindStrength")<=0))throw new Exception("Foliage wind did not resume.");
            return $"PASS: {counts.Sum(n=>(long)n)/3} traffic triangles preserved in paint/glass/tyre/trim groups [{string.Join(",",counts)}]; one shared traffic mesh; four foliage batches; reduced-motion wind disabled and restored.";
        }
    }
}
