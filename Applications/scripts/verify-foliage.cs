var game=UnityEngine.Object.FindFirstObjectByType<TableTalk.TableTalkPresentation>();
var flags=System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance;
var shown=(TableTalk.BoardSnapshot)game.GetType().GetField("shown",flags).GetValue(game);
if(shown.roomCode!="STUDIO")throw new System.Exception("Only the isolated STUDIO scene may run this check.");
var layouts=new System.Collections.Generic.List<object>();
foreach(int size in new[]{40,48,56,64}){
 game.GetType().GetMethod("BuildLandscape",flags).Invoke(game,new object[]{size});
 var meshes=(System.Collections.Generic.List<UnityEngine.Mesh>)game.GetType().GetField("landscapeMeshes",flags).GetValue(game);
 var leaves=System.Linq.Enumerable.ToArray(System.Linq.Enumerable.Where(meshes,m=>m.name.StartsWith("Layered leaf")));
 var bark=System.Linq.Enumerable.First(meshes,m=>m.name=="Branching hardwood trunks");
 if(leaves.Length!=4||leaves.Any(m=>m.vertexCount==0)||bark.vertexCount==0)throw new System.Exception("A foliage or branch batch is empty.");
 var triangles=leaves.Sum(m=>m.triangles.Length/3)+bark.triangles.Length/3;
 if(triangles>120000)throw new System.Exception("Roadside geometry exceeds the mobile review budget.");
 foreach(var mesh in leaves){
  if(mesh.vertices.Any(v=>float.IsNaN(v.x)||float.IsNaN(v.y)||float.IsNaN(v.z)||float.IsInfinity(v.sqrMagnitude)))throw new System.Exception("Invalid canopy vertex.");
  if(mesh.uv.Any(uv=>uv.x<-.001f||uv.y<-.001f||uv.x>1.001f||uv.y>1.001f))throw new System.Exception("Leaf atlas UV outside its texture.");
 }
 layouts.Add(new{boardSize=size,canopyBatches=leaves.Length,triangles,barkTriangles=bark.triangles.Length/3,leafTriangles=leaves.Sum(m=>m.triangles.Length/3)});
}
game.ResetSnapshot(game.previewSnapshot.text);
var qualityChecks=new System.Collections.Generic.List<object>();
foreach(var quality in new[]{"auto","low","high"}){
 game.SetVisualSettings("{\"quality\":\""+quality+"\",\"mobile\":true,\"theme\":\"day\",\"camera\":\"top\"}");
 var materials=(System.Collections.Generic.List<UnityEngine.Material>)game.GetType().GetField("foliageInstances",flags).GetValue(game);
 if(materials.Count!=4||materials.Any(m=>m.mainTexture==null||!m.shader.isSupported))throw new System.Exception("A graphics tier lost its textured leaves.");
 qualityChecks.Add(new{quality,materials=materials.Count,texture=materials[0].mainTexture.name,width=materials[0].mainTexture.width});
}
var shrubs=UnityEngine.Object.FindObjectsByType<UnityEngine.MeshRenderer>(UnityEngine.FindObjectsSortMode.None).Where(r=>r.name=="Low garden planting").Last();
if(shrubs.sharedMaterial.shader!=game.treeFoliage.shader)throw new System.Exception("Garden planting reverted to a solid green surface.");
var report=new{layouts,qualityChecks,shrubsTextured=true,windAndTraffic=TableTalk.Editor.MobileEnvironmentAssets.Verify(),physicalDevice=false,frame=UnityEngine.Time.frameCount};
System.IO.File.WriteAllText("Applications/verification/trees-0.8.5-render-check.json",Newtonsoft.Json.JsonConvert.SerializeObject(report,Newtonsoft.Json.Formatting.Indented));
return report;
