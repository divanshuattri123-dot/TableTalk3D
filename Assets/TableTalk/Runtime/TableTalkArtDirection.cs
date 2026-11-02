using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace TableTalk
{
    public partial class TableTalkPresentation
    {
        VolumeProfile artProfile;
        Material detailedCity;

        void ApplyArtDirection(bool night, bool battery, bool mobile)
        {
            LightBoardWorld(night,battery);
            var pipeline = UniversalRenderPipeline.asset;
            if (pipeline != null)
            {
                pipeline.msaaSampleCount = battery ? 2 : mobile ? 2 : 4;
                pipeline.shadowCascadeCount = battery ? 1 : 2;
                pipeline.shadowDepthBias = .5f;
                pipeline.shadowNormalBias = .35f;
            }
            if (artProfile == null)
            {
                var volume = Object.FindFirstObjectByType<Volume>();
                if (volume != null) artProfile = volume.profile;
            }
            if (artProfile != null)
            {
                if (artProfile.TryGet<ColorAdjustments>(out var color))
                { color.contrast.Override(11); color.saturation.Override(8); color.postExposure.Override(night ? .1f : -.08f); }
                if (artProfile.TryGet<Bloom>(out var bloom))
                { bloom.intensity.Override(battery ? 0 : night ? .28f : .12f); bloom.threshold.Override(1.1f); bloom.maxIterations.Override(mobile ? 2 : 3); }
                if (artProfile.TryGet<Vignette>(out var vignette)) vignette.intensity.Override(.045f);
            }
            if (city != null && detailedCity == null)
            {
                // Keep authored assets unchanged: each running table owns its material instance.
                detailedCity = new Material(cityMaterial);
                foreach (var renderer in city.GetComponentsInChildren<Renderer>()) renderer.sharedMaterial = detailedCity;
            }
            if (detailedCity != null)
            {
                detailedCity.SetFloat("_NightLighting", night ? 1 : 0);
                detailedCity.SetFloat("_FacadeDetail", battery ? .3f : .75f);
            }
            if (RenderSettings.sun != null)
            {
                RenderSettings.sun.intensity = night ? .65f : 1.65f;
                RenderSettings.sun.color = ColorOf(night ? "#a5c4ed" : "#fff2df");
                RenderSettings.sun.transform.rotation = Quaternion.Euler(night ? 38 : 48, -32, 0);
            }
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientGroundColor = ColorOf(night ? "#263943" : "#788168");
            RenderSettings.reflectionIntensity = night ? .35f : .9f;
        }
    }
}
