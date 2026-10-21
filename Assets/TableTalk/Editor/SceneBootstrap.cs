using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using TMPro;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.InputSystem.UI;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace TableTalk.Editor
{
    public static class SceneBootstrap
    {
        [Serializable] class ModelEntry { public string id, label, filename; }
        [Serializable] class Manifest { public ModelEntry[] models; }
        const string Art = "Assets/TableTalk/Art";

        public static void BuildWebGL()
        {
            var projectRoot = Directory.GetParent(Application.dataPath).FullName;
            var outputPath = Path.Combine(projectRoot, "Build", "Web");
            var args = Environment.GetCommandLineArgs();
            for (var i = 0; i < args.Length; i++)
            {
                if (args[i] == "-buildOutput" && i + 1 < args.Length)
                {
                    outputPath = args[++i];
                    break;
                }
                if (args[i].StartsWith("-buildOutput=", StringComparison.Ordinal))
                {
                    outputPath = args[i].Substring("-buildOutput=".Length);
                    break;
                }
            }

            if (!Path.IsPathRooted(outputPath)) outputPath = Path.Combine(projectRoot, outputPath);
            Directory.CreateDirectory(Path.GetDirectoryName(outputPath));
            var scenes = EditorBuildSettings.scenes.Where(scene => scene.enabled).Select(scene => scene.path).ToArray();
            if (scenes.Length == 0) throw new InvalidOperationException("Enable at least one scene in Build Settings.");

            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = scenes,
                locationPathName = outputPath,
                target = BuildTarget.WebGL,
                options = BuildOptions.None
            });
            if (report.summary.result != BuildResult.Succeeded)
                throw new InvalidOperationException($"WebGL build failed: {report.summary.result}.");

            Debug.Log($"WebGL build succeeded: {report.summary.totalSize:N0} bytes at {outputPath}.");
        }

        public static string Import(string source)
        {
            Directory.CreateDirectory(Art + "/Models");
            Directory.CreateDirectory(Art + "/Meshes");
            Directory.CreateDirectory("Assets/TableTalk/Settings");
            Directory.CreateDirectory("Assets/TableTalk/Scenes");
            var manifest = JsonUtility.FromJson<Manifest>(File.ReadAllText(Path.Combine(source, "ImportManifest.json")));
            foreach (var model in manifest.models) CopyOnce(Path.Combine(source, model.filename), Art + "/Models/" + model.filename);
            CopyOnce(Path.Combine(source, "CityPalette.png"), Art + "/CityPalette.png");
            CopyOnce(Path.Combine(source, "PreviewSnapshot.json"), Art + "/PreviewSnapshot.json");
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);
            if (Resources.Load<TMP_Settings>("TMP Settings") == null)
                throw new InvalidOperationException("Import the bundled TMP essentials before building the preview.");
            AssetDatabase.Refresh(ImportAssetOptions.ForceSynchronousImport);

            QualitySettings.SetQualityLevel(0, true);
            QualitySettings.vSyncCount = 0;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            var urp = UniversalRenderPipeline.asset;
            if (urp == null) throw new InvalidOperationException("The active quality tier has no URP asset.");
            urp.supportsHDR = true; urp.msaaSampleCount = 2; urp.renderScale = 1;
            urp.shadowDistance = 28; EditorUtility.SetDirty(urp);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = Hex("#c7dcf6"); RenderSettings.ambientEquatorColor = Hex("#a5bdba");
            RenderSettings.ambientGroundColor = Hex("#718b6e");
            var cameraObject = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener), typeof(UniversalAdditionalCameraData));
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.GetComponent<Camera>(); camera.fieldOfView = 34; camera.nearClipPlane = .1f; camera.farClipPlane = 120;
            camera.rect = new Rect(0, .1f, 1, .7875f);
            camera.clearFlags = CameraClearFlags.SolidColor; camera.backgroundColor = Hex("#8bc9dc"); camera.allowHDR = true;
            camera.transform.position = new Vector3(0, 22, -5.28f); camera.transform.LookAt(Vector3.zero);
            var additional = camera.GetUniversalAdditionalCameraData(); additional.renderPostProcessing = true; additional.volumeLayerMask = 1;
            var sunObject = new GameObject("Soft afternoon sun", typeof(Light));
            var sun = sunObject.GetComponent<Light>(); sun.type = LightType.Directional; sun.intensity = 2.1f;
            sun.color = new Color(1, .97f, .9f); sun.shadows = LightShadows.Soft; sun.shadowStrength = .65f;
            sun.transform.rotation = Quaternion.Euler(48, -32, 0); RenderSettings.sun = sun;
            var water = GameObject.CreatePrimitive(PrimitiveType.Cube); water.name = "Quiet blue surround";
            water.transform.position = new Vector3(0, -.58f, 0); water.transform.localScale = new Vector3(100, .1f, 100);
            water.GetComponent<Renderer>().sharedMaterial = MakeMaterial("Surround", Hex("#7dc7d8"));

            var profile = ScriptableObject.CreateInstance<VolumeProfile>();
            var tone = profile.Add<Tonemapping>(true); tone.mode.value = TonemappingMode.ACES;
            var bloom = profile.Add<Bloom>(true); bloom.intensity.value = .5f; bloom.threshold.value = .9f;
            bloom.downscale.value = BloomDownscaleMode.Quarter; bloom.maxIterations.value = 3;
            var vignette = profile.Add<Vignette>(true); vignette.intensity.value = .18f; vignette.smoothness.value = .4f;
            var colours = profile.Add<ColorAdjustments>(true); colours.saturation.value = 12; colours.contrast.value = 7;
            AssetDatabase.CreateAsset(profile, "Assets/TableTalk/Settings/CityPostProcess.asset");
            foreach (var component in profile.components) AssetDatabase.AddObjectToAsset(component, profile);
            var volume = new GameObject("Colour and tone", typeof(Volume)).GetComponent<Volume>(); volume.isGlobal = true; volume.sharedProfile = profile;

            var paletteImporter = (TextureImporter)AssetImporter.GetAtPath(Art + "/CityPalette.png");
            paletteImporter.sRGBTexture = true; paletteImporter.maxTextureSize = 512;
            paletteImporter.filterMode = FilterMode.Bilinear; paletteImporter.wrapMode = TextureWrapMode.Clamp;
            paletteImporter.isReadable = false; paletteImporter.SaveAndReimport();
            var cityMaterial = MakeMaterial("Classic city palette", Color.white);
            cityMaterial.mainTexture = AssetDatabase.LoadAssetAtPath<Texture2D>(Art + "/CityPalette.png");
            EditorUtility.SetDirty(cityMaterial);
            var city = new GameObject("Native classic city").transform; city.position = new Vector3(0, .23f, 0); city.localScale = Vector3.one * 8.55f;
            int triangleCount = 0;
            using (var reader = new BinaryReader(File.OpenRead(Path.Combine(source, "ClassicCity.bytes"))))
            {
                if (reader.ReadUInt32() != 0x54544331) throw new InvalidDataException("Unknown city mesh format.");
                int count = reader.ReadInt32();
                for (int part = 0; part < count; part++)
                {
                    string name = System.Text.Encoding.UTF8.GetString(reader.ReadBytes(reader.ReadInt32()));
                    int vertexCount = reader.ReadInt32(), indexCount = reader.ReadInt32();
                    var mesh = new Mesh { name = name, indexFormat = vertexCount > 65535 ? IndexFormat.UInt32 : IndexFormat.UInt16 };
                    var vertices = new Vector3[vertexCount]; var normals = new Vector3[vertexCount];
                    var uv = new Vector2[vertexCount]; var uv2 = new Vector2[vertexCount];
                    for (int i = 0; i < vertexCount; i++) vertices[i] = new Vector3(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle());
                    for (int i = 0; i < vertexCount; i++) normals[i] = new Vector3(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle()).normalized;
                    for (int i = 0; i < vertexCount; i++) uv[i] = new Vector2(reader.ReadSingle(), reader.ReadSingle());
                    for (int i = 0; i < vertexCount; i++) uv2[i] = new Vector2(reader.ReadSingle(), reader.ReadSingle());
                    var indices = new int[indexCount]; for (int i = 0; i < indexCount; i++) indices[i] = reader.ReadInt32();
                    mesh.vertices = vertices; mesh.normals = normals; mesh.uv = uv; mesh.uv2 = uv2; mesh.triangles = indices;
                    mesh.RecalculateBounds(); MeshUtility.SetMeshCompression(mesh, ModelImporterMeshCompression.Medium);
                    AssetDatabase.CreateAsset(mesh, Art + "/Meshes/" + name + ".asset"); triangleCount += indexCount / 3;
                    var obj = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer)); obj.transform.SetParent(city, false);
                    obj.GetComponent<MeshFilter>().sharedMesh = mesh;
                    var renderer = obj.GetComponent<MeshRenderer>(); renderer.sharedMaterial = cityMaterial; renderer.receiveShadows = true;
                    GameObjectUtility.SetStaticEditorFlags(obj, StaticEditorFlags.BatchingStatic);
                }
            }

            var controller = new GameObject("GamePresentation", typeof(TableTalkPresentation)).GetComponent<TableTalkPresentation>();
            controller.boardCamera = camera; controller.city = city; controller.cityMaterial = cityMaterial;
            controller.previewSnapshot = AssetDatabase.LoadAssetAtPath<TextAsset>(Art + "/PreviewSnapshot.json");
            controller.tokens = manifest.models.Where(m => m.id != "m-9f855f9c940bd3dc" && m.id != "m-ced7776dfdb91274" && m.id != "m-89f8900757bf522f" && m.id != "m-dfc1c1718a2a1115")
                .Select(m => new TokenAsset { id = m.id, label = m.label, prefab = AssetDatabase.LoadAssetAtPath<GameObject>(Art + "/Models/" + m.filename) }).ToArray();
            var cageAsset = AssetDatabase.LoadAssetAtPath<GameObject>(Art + "/Models/m-89f8900757bf522f.obj");
            if (cageAsset != null)
            {
                var cage = UnityEngine.Object.Instantiate(cageAsset); cage.name = "Jail cage · only when jailed";
                var bounds = cage.GetComponentsInChildren<Renderer>().Select(r => r.bounds).Aggregate((a, b) => { a.Encapsulate(b); return a; });
                float scale = 1.1f / Mathf.Max(bounds.size.x, bounds.size.y, bounds.size.z);
                cage.transform.localScale *= scale; cage.transform.position = BoardLayout.Point(10, 40) - new Vector3(bounds.center.x, bounds.min.y, bounds.center.z) * scale;
                var cageMaterial = MakeMaterial("Jail steel", Hex("#6a8090")); cageMaterial.SetFloat("_Metallic", .75f);
                foreach (var render in cage.GetComponentsInChildren<Renderer>()) render.sharedMaterial = cageMaterial;
                cage.SetActive(false); controller.jailBars = cage;
                controller.jailMeshOffset = cage.transform.position - BoardLayout.Point(10, 40);
            }
            BuildStudioUI(controller);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene("Assets/TableTalk/Scenes/TableTalk.unity", true) };
            EditorUtility.SetDirty(controller); AssetDatabase.SaveAssets();
            EditorSceneManager.MarkSceneDirty(scene); EditorSceneManager.SaveScene(scene, "Assets/TableTalk/Scenes/TableTalk.unity");
            return $"Saved TableTalk scene. City: {triangleCount} triangles in 5 native parts; {controller.tokens.Length} token models; active tier {QualitySettings.names[QualitySettings.GetQualityLevel()]}.";
        }

        static void CopyOnce(string source, string target) { if (!File.Exists(target)) File.Copy(source, target, false); }

        static void BuildStudioUI(TableTalkPresentation controller)
        {
            var canvasObject = new GameObject("Studio HUD", typeof(Canvas), typeof(UnityEngine.UI.CanvasScaler), typeof(UnityEngine.UI.GraphicRaycaster));
            var canvas = canvasObject.GetComponent<Canvas>(); canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasObject.GetComponent<UnityEngine.UI.CanvasScaler>();
            scaler.uiScaleMode = UnityEngine.UI.CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1000, 800); scaler.matchWidthOrHeight = 1;
            controller.studioCanvas = canvas;
            var header = Panel(canvas.transform, "Header", new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, 1), new Vector2(0, 90), Hex("#f5faf5"));
            Label(header, "TABLE TALK 3D", new Vector2(0, .48f), new Vector2(1, 1), 26, Hex("#173f30"));
            controller.statusText = Label(header, "Graphics studio · preview, not a live match", Vector2.zero, new Vector2(1, .48f), 16, Hex("#3f6456"));
            var footer = Panel(canvas.transform, "Camera and animation controls", Vector2.zero, new Vector2(1, 0), Vector2.zero, new Vector2(0, 80), Hex("#f5faf5"));
            var layout = footer.gameObject.AddComponent<UnityEngine.UI.HorizontalLayoutGroup>();
            layout.padding = new RectOffset(12, 12, 8, 8); layout.spacing = 8; layout.childControlWidth = layout.childControlHeight = true;
            layout.childForceExpandWidth = layout.childForceExpandHeight = true;
            Button(footer, "Whole\nboard", controller.WholeBoard);
            Button(footer, "Follow\nplayer", controller.FocusActive);
            Button(footer, "Token\nmotion", controller.PreviewAnimation);
            Button(footer, "Jail\ntransfer", controller.PreviewJail);
            var events = new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem), typeof(InputSystemUIInputModule));
        }

        static RectTransform Panel(Transform parent, string name, Vector2 min, Vector2 max, Vector2 pivot, Vector2 size, Color color)
        {
            var obj = new GameObject(name, typeof(RectTransform), typeof(UnityEngine.UI.Image)); obj.transform.SetParent(parent, false);
            var rect = obj.GetComponent<RectTransform>(); rect.anchorMin = min; rect.anchorMax = max; rect.pivot = pivot;
            rect.sizeDelta = size; rect.anchoredPosition = Vector2.zero;
            var image = obj.GetComponent<UnityEngine.UI.Image>(); image.color = color; image.raycastTarget = false; return rect;
        }
        static TextMeshProUGUI Label(Transform parent, string text, Vector2 min, Vector2 max, int size, Color color)
        {
            var obj = new GameObject(text, typeof(RectTransform), typeof(TextMeshProUGUI)); obj.transform.SetParent(parent, false);
            var tmp = obj.GetComponent<TextMeshProUGUI>(); tmp.font = TMP_Settings.defaultFontAsset;
            tmp.text = text; tmp.fontSize = size; tmp.enableAutoSizing = true; tmp.fontSizeMin = 12; tmp.fontSizeMax = size;
            tmp.color = color; tmp.alignment = TextAlignmentOptions.Center; tmp.raycastTarget = false;
            tmp.rectTransform.anchorMin = min; tmp.rectTransform.anchorMax = max;
            tmp.rectTransform.offsetMin = new Vector2(8, 2); tmp.rectTransform.offsetMax = new Vector2(-8, -2); return tmp;
        }
        static void Button(Transform parent, string label, UnityEngine.Events.UnityAction action)
        {
            var rect = Panel(parent, label, Vector2.zero, Vector2.one, new Vector2(.5f, .5f), new Vector2(100, 60), Hex("#176d4d"));
            rect.GetComponent<UnityEngine.UI.Image>().raycastTarget = true;
            var button = rect.gameObject.AddComponent<UnityEngine.UI.Button>(); button.targetGraphic = rect.GetComponent<UnityEngine.UI.Image>();
            button.onClick.AddListener(action);
            UnityEditor.Events.UnityEventTools.AddPersistentListener(button.onClick, action);
            button.onClick.RemoveListener(action);
            Label(rect, label, Vector2.zero, Vector2.one, 20, Color.white);
            var element = rect.gameObject.AddComponent<UnityEngine.UI.LayoutElement>(); element.flexibleWidth = 1;
        }
        static Material MakeMaterial(string name, Color color)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) throw new InvalidOperationException("URP/Lit is unavailable.");
            var material = new Material(shader) { name = name, color = color };
            material.SetFloat("_Smoothness", .22f); material.SetFloat("_Metallic", .02f);
            AssetDatabase.CreateAsset(material, Art + "/" + name + ".mat"); return material;
        }
        static Color Hex(string value) => ColorUtility.TryParseHtmlString(value, out var color) ? color : Color.white;
    }
}
