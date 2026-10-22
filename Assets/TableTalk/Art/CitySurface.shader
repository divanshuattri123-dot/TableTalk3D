Shader "TableTalk/City Surface"
{
    Properties
    {
        _BaseMap("Original city palette", 2D) = "white" {}
        _BaseColor("Tint", Color) = (1,1,1,1)
        _CityLighting("Recovered contact lighting", 2D) = "white" {}
        _OcclusionStrength("Contact shadow strength", Range(0,1)) = .65
        _Cutoff("Cutoff", Float) = .5
        _Cull("Cull", Float) = 2
    }
    SubShader
    {
        Tags { "RenderPipeline"="UniversalPipeline" "RenderType"="Opaque" "Queue"="Geometry" }
        Pass
        {
            Name "ForwardLit"
            Tags { "LightMode"="UniversalForward" }
            Cull [_Cull]
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma target 3.0
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            TEXTURE2D(_BaseMap); SAMPLER(sampler_BaseMap);
            TEXTURE2D(_CityLighting); SAMPLER(sampler_CityLighting);
            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;
                half4 _BaseColor;
                half _OcclusionStrength, _Cutoff, _Cull;
            CBUFFER_END
            struct Attributes { float4 positionOS:POSITION; float3 normalOS:NORMAL; float2 uv:TEXCOORD0; float2 lightUv:TEXCOORD1; };
            struct Varyings { float4 positionCS:SV_POSITION; float3 positionWS:TEXCOORD0; half3 normalWS:TEXCOORD1; float2 uv:TEXCOORD2; float2 lightUv:TEXCOORD3; half fog:TEXCOORD4; };
            Varyings Vert(Attributes v)
            {
                Varyings o;
                VertexPositionInputs p=GetVertexPositionInputs(v.positionOS.xyz);
                o.positionCS=p.positionCS; o.positionWS=p.positionWS;
                o.normalWS=TransformObjectToWorldNormal(v.normalOS);
                o.uv=TRANSFORM_TEX(v.uv,_BaseMap); o.lightUv=v.lightUv;
                o.fog=ComputeFogFactor(p.positionCS.z); return o;
            }
            half4 Frag(Varyings i):SV_Target
            {
                half3 albedo=SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,i.uv).rgb*_BaseColor.rgb;
                half3 contact=SAMPLE_TEXTURE2D(_CityLighting,sampler_CityLighting,i.lightUv).rgb;
                // The supplied UV2 atlas preserves facade recesses without a phone-sized SSAO pass.
                half occlusion=lerp(1,saturate(dot(contact,half3(.333,.333,.333))*2.7+.18),_OcclusionStrength);
                half glass=saturate((albedo.b-albedo.r)*5)*saturate((albedo.g-albedo.r)*5);
                SurfaceData s=(SurfaceData)0;
                s.albedo=albedo; s.alpha=1; s.normalTS=half3(0,0,1);
                s.metallic=lerp(.015,.28,glass); s.smoothness=lerp(.24,.8,glass); s.occlusion=occlusion;
                InputData d=(InputData)0;
                d.positionWS=i.positionWS; d.positionCS=i.positionCS;
                d.normalWS=NormalizeNormalPerPixel(i.normalWS); d.viewDirectionWS=GetWorldSpaceNormalizeViewDir(i.positionWS);
                d.shadowCoord=TransformWorldToShadowCoord(i.positionWS); d.bakedGI=SampleSH(d.normalWS);
                d.shadowMask=half4(1,1,1,1); d.normalizedScreenSpaceUV=GetNormalizedScreenSpaceUV(i.positionCS);
                half4 color=UniversalFragmentPBR(d,s);
                color.rgb=MixFog(color.rgb,i.fog); return color;
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
        UsePass "Universal Render Pipeline/Lit/DepthOnly"
    }
    Fallback "Universal Render Pipeline/Lit"
}
