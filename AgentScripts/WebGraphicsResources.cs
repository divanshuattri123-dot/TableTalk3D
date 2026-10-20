using System;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering.Universal;

public static class WebGraphicsResources
{
    public static object Prepare()
    {
        // These variants are selected at runtime, so the build cannot infer them from the city scene.
        var shader = Shader.Find("Hidden/TableTalk/Web Upscale");
        if (shader == null) throw new InvalidOperationException("The WebGL upscaling shader has not imported.");
        const string postPath = "Assets/TableTalk/Settings/WebPostProcessData.asset";
        var mobile = AssetDatabase.LoadAssetAtPath<UniversalRendererData>("Assets/Settings/Mobile_Renderer.asset");
        var post = AssetDatabase.LoadAssetAtPath<PostProcessData>(postPath);
        if (post == null) { post = UnityEngine.Object.Instantiate(mobile.postProcessData); AssetDatabase.CreateAsset(post, postPath); }
        // FSR's texture-gather instructions are unavailable in WebGL 2. Keep native resolution and a compatible fallback.
        post.shaders.easuPS = shader; EditorUtility.SetDirty(post);
        foreach (var profile in new[] { "Mobile", "PC" })
        {
            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>("Assets/Settings/" + profile + "_Renderer.asset");
            renderer.postProcessData = post; EditorUtility.SetDirty(renderer);
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>("Assets/Settings/" + profile + "_RPAsset.asset");
            pipeline.upscalingFilter = UpscalingFilterSelection.Linear; pipeline.renderScale = 1; EditorUtility.SetDirty(pipeline);
        }
        const string folder = "Assets/TableTalk/Resources";
        if (!AssetDatabase.IsValidFolder(folder)) AssetDatabase.CreateFolder("Assets/TableTalk", "Resources");
        const string path = folder + "/LeafCanopy.mat";
        var leaves = AssetDatabase.LoadAssetAtPath<Material>(path);
        if (leaves == null) { leaves = new Material(Shader.Find("Universal Render Pipeline/Lit")); AssetDatabase.CreateAsset(leaves, path); }
        leaves.SetFloat("_AlphaClip", 1); leaves.SetFloat("_Cutoff", .33f); leaves.SetFloat("_Cull", 0); leaves.EnableKeyword("_ALPHATEST_ON"); leaves.renderQueue = 2450;
        EditorUtility.SetDirty(leaves); AssetDatabase.SaveAssets();
        return new { shader = shader.name, foliageVariant = leaves.IsKeywordEnabled("_ALPHATEST_ON"), saved = path };
    }
}
