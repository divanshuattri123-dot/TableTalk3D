using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using TableTalk;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class WebIntegration
{
    public static object Prepare()
    {
        var controller = UnityEngine.Object.FindAnyObjectByType<TableTalkPresentation>();
        if (controller == null) throw new Exception("Open the TableTalk scene first.");
        const string models = "Assets/TableTalk/Art/Models/";
        controller.dicePrefab = AssetDatabase.LoadAssetAtPath<GameObject>(models + "m-dfc1c1718a2a1115.obj");
        controller.houseMesh = AssetDatabase.LoadAssetAtPath<GameObject>(models + "m-9f855f9c940bd3dc.obj").GetComponentInChildren<MeshFilter>().sharedMesh;
        controller.hotelMesh = AssetDatabase.LoadAssetAtPath<GameObject>(models + "m-ced7776dfdb91274.obj").GetComponentInChildren<MeshFilter>().sharedMesh;
        EditorUtility.SetDirty(controller); EditorSceneManager.MarkSceneDirty(controller.gameObject.scene);
        EditorSceneManager.SaveScene(controller.gameObject.scene);
        var target = NamedBuildTarget.WebGL;
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
        PlayerSettings.WebGL.decompressionFallback = false;
        PlayerSettings.WebGL.dataCaching = true;
        PlayerSettings.WebGL.initialMemorySize = 128;
        PlayerSettings.WebGL.maximumMemorySize = 512;
        PlayerSettings.WebGL.memoryGrowthMode = WebGLMemoryGrowthMode.Geometric;
        PlayerSettings.stripUnusedMeshComponents = true;
        PlayerSettings.stripEngineCode = true;
        PlayerSettings.SetManagedStrippingLevel(target, ManagedStrippingLevel.Medium);
        PlayerSettings.SetIl2CppCodeGeneration(target, Il2CppCodeGeneration.OptimizeSize);
        UnityEditor.WebGL.UserBuildSettings.codeOptimization = UnityEditor.WebGL.WasmCodeOptimization.DiskSize;
        AssetDatabase.SaveAssets();
        return new { compression = PlayerSettings.WebGL.compressionFormat.ToString(), controller.tokens.Length, dice = controller.dicePrefab != null, house = controller.houseMesh != null, hotel = controller.hotelMesh != null };
    }

    public static async Task<object> VerifyMotion()
    {
        var controller = UnityEngine.Object.FindAnyObjectByType<TableTalkPresentation>();
        controller.BeginWeb();
        controller.ResetSnapshot(File.ReadAllText("Assets/TableTalk/Art/PreviewSnapshot.json"));
        int firstFrame = Time.frameCount;
        controller.PresentFrame("{\"id\":\"verify-dice\",\"kind\":\"dice\",\"duration\":1450,\"dice\":[2,5]}");
        await Wait(controller, "verify-dice");
        if (GameObject.Find("Tumbling dice") != null) throw new Exception("Dice were not hidden after settling.");
        var state = JsonUtility.FromJson<BoardSnapshot>(File.ReadAllText("Assets/TableTalk/Art/PreviewSnapshot.json"));
        string id = state.players[0].id;
        controller.PresentFrame("{\"id\":\"verify-route\",\"kind\":\"move\",\"duration\":1060,\"playerId\":\"" + id + "\",\"route\":[1,2,3]}");
        await Wait(controller, "verify-route");
        var piece = GameObject.Find(state.players[0].name + " token").transform;
        if (Vector3.Distance(piece.position, BoardLayout.Point(3, 40)) > .05f) throw new Exception("Route did not end at tile 3.");
        controller.PresentFrame("{\"id\":\"verify-jail\",\"kind\":\"jail\",\"duration\":1900,\"playerId\":\"" + id + "\",\"tileId\":10,\"route\":[10]}");
        await Wait(controller, "verify-jail");
        if (Vector3.Distance(piece.position, BoardLayout.Point(10, 40)) > .05f || !controller.jailBars.activeSelf) throw new Exception("Jail transfer/cage failed.");
        controller.PresentFrame("{\"id\":\"verify-release\",\"kind\":\"release\",\"duration\":1400,\"playerId\":\"" + id + "\"}");
        await Wait(controller, "verify-release");
        if (controller.jailBars.activeSelf) throw new Exception("Jail release did not lift the cage.");
        controller.RegisterModel("{\"id\":\"qa-streamed\",\"positions\":[0,0,0,1,0,0,0,1,0],\"normals\":[0,0,1,0,0,1,0,0,1],\"indices\":[0,1,2]}");
        state.players[0].position = 10; state.players[0].tokenId = "qa-streamed";
        controller.SyncSnapshot(JsonUtility.ToJson(state));
        await Task.Delay(60);
        var visual = piece.Find("Token visual");
        var bounds = visual.GetComponentInChildren<Renderer>().bounds;
        if (Mathf.Abs(bounds.center.x - piece.position.x) > .05f || Mathf.Abs(bounds.center.z - piece.position.z) > .05f) throw new Exception("A streamed token was not centred on its player.");
        return new { passed = true, frames = Time.frameCount - firstFrame, sequences = new[] { "dice 2+5", "route 1,2,3", "direct jail 10", "cage release", "streamed asset placement" } };
    }
    static async Task Wait(TableTalkPresentation controller, string id)
    {
        var limit = DateTime.UtcNow.AddSeconds(12);
        while (controller.CompletedFrameId != id && DateTime.UtcNow < limit) await Task.Delay(30);
        if (controller.CompletedFrameId != id) throw new TimeoutException(id + " never completed.");
    }
}
