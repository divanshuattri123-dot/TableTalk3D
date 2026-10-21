using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace TableTalk.Editor
{
    public static class ReferenceCityLook
    {
        public static string Apply()
        {
            var profile = AssetDatabase.LoadAssetAtPath<VolumeProfile>("Assets/TableTalk/Settings/CityPostProcess.asset");
            if (profile == null) throw new System.InvalidOperationException("City colour profile is missing.");
            profile.components.RemoveAll(component => component == null);
            var tone = Get<Tonemapping>(profile); tone.mode.Override(TonemappingMode.ACES);
            var colour = Get<ColorAdjustments>(profile); colour.contrast.Override(13); colour.saturation.Override(14); colour.postExposure.Override(0);
            var bloom = Get<Bloom>(profile); bloom.threshold.Override(1.15f); bloom.intensity.Override(.1f);
            bloom.downscale.Override(BloomDownscaleMode.Quarter); bloom.maxIterations.Override(2);
            var vignette = Get<Vignette>(profile); vignette.intensity.Override(.1f); vignette.smoothness.Override(.45f);
            // Volume components must be sub-assets or the saved profile loses every override on reload.
            foreach (var component in profile.components)
            {
                if (!AssetDatabase.Contains(component)) AssetDatabase.AddObjectToAsset(component, profile);
                EditorUtility.SetDirty(component);
            }
            EditorUtility.SetDirty(profile);
            AssetDatabase.SaveAssets();
            return "Persisted four actual colour/tonemap overrides; original detailed city geometry retained.";
        }
        static T Get<T>(VolumeProfile profile) where T : VolumeComponent => profile.TryGet<T>(out var value) ? value : profile.Add<T>(true);
    }
}
