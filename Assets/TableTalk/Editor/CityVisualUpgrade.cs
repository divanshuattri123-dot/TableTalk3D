using System;
using System.IO;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace TableTalk.Editor
{
    public static class CityVisualUpgrade
    {
        const string Art = "Assets/TableTalk/Art/";
        public static string Apply(string source = null)
        {
            if (EditorApplication.isPlaying) throw new InvalidOperationException("Leave the disposable preview before saving art.");
            string target = Art + "CityContactLighting.png";
            if (!File.Exists(target) && (string.IsNullOrWhiteSpace(source) || !File.Exists(source)))
                throw new FileNotFoundException("Pass the supplied classic-city contact-lighting PNG when importing for the first time.");
            if (!File.Exists(target)) File.Copy(source, target);
            AssetDatabase.ImportAsset(target, ImportAssetOptions.ForceSynchronousImport);
            var importer = (TextureImporter)AssetImporter.GetAtPath(target);
            importer.sRGBTexture = false; importer.maxTextureSize = 2048;
            importer.textureCompression = TextureImporterCompression.CompressedHQ;
            importer.wrapMode = TextureWrapMode.Clamp; importer.filterMode = FilterMode.Trilinear;
            importer.isReadable = false; importer.SaveAndReimport();
            var material = AssetDatabase.LoadAssetAtPath<Material>(Art + "Classic city palette.mat");
            var shader = Shader.Find("TableTalk/City Surface");
            if (shader == null || !shader.isSupported) throw new InvalidOperationException("City surface shader is unavailable.");
            material.shader = shader;
            material.SetTexture("_BaseMap", AssetDatabase.LoadAssetAtPath<Texture2D>(Art + "CityPalette.png"));
            material.SetTexture("_CityLighting", AssetDatabase.LoadAssetAtPath<Texture2D>(target));
            material.SetColor("_BaseColor", Color.white); material.SetFloat("_OcclusionStrength", .65f);
            EditorUtility.SetDirty(material);
            // A static sky reflection is shared by every glossy surface; it never renders six extra cameras per frame.
            const string reflectionPath = "Assets/TableTalk/Settings/DaylightReflection.asset";
            var sky = AssetDatabase.LoadAssetAtPath<Cubemap>(reflectionPath);
            if (sky == null)
            {
                const int size = 64;
                sky = new Cubemap(size, TextureFormat.RGBAHalf, true) { name = "Soft daylight reflection" };
                for (int face = 0; face < 6; face++)
                {
                    var pixels = new Color[size * size];
                    for (int y = 0; y < size; y++) for (int x = 0; x < size; x++)
                    {
                        float u = 2 * (x + .5f) / size - 1, v = 2 * (y + .5f) / size - 1;
                        Vector3 direction = face == 0 ? new Vector3(1,-v,-u) : face == 1 ? new Vector3(-1,-v,u) : face == 2 ? new Vector3(u,1,v) : face == 3 ? new Vector3(u,-1,-v) : face == 4 ? new Vector3(u,-v,1) : new Vector3(-u,-v,-1);
                        float elevation = direction.normalized.y;
                        pixels[y * size + x] = elevation >= 0 ? Color.Lerp(new Color(.74f,.79f,.82f),new Color(.27f,.49f,.75f),elevation) : Color.Lerp(new Color(.74f,.79f,.82f),new Color(.19f,.24f,.13f),-elevation);
                    }
                    sky.SetPixels(pixels,(CubemapFace)face);
                }
                sky.Apply(true,false); AssetDatabase.CreateAsset(sky,reflectionPath);
            }
            RenderSettings.defaultReflectionMode = DefaultReflectionMode.Custom;
            RenderSettings.customReflectionTexture = sky; RenderSettings.reflectionIntensity = .75f;
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>("Assets/TableTalk/Settings/CityPostProcess.asset");
            if (profile.TryGet<ColorAdjustments>(out var colours)) { colours.contrast.Override(8); colours.saturation.Override(5); }
            if (profile.TryGet<Bloom>(out var bloom)) bloom.intensity.Override(.18f);
            EditorUtility.SetDirty(profile);
            UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(UnityEngine.SceneManagement.SceneManager.GetActiveScene());
            UnityEditor.SceneManagement.EditorSceneManager.SaveOpenScenes(); AssetDatabase.SaveAssets();
            return "Saved original UV2 contact lighting, glass response, daylight reflection and restrained colour grade.";
        }
    }
}
