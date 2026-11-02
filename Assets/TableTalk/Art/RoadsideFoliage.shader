Shader "TableTalk/Roadside Foliage"
{
    Properties
    {
        [MainTexture] _BaseMap("Leaves",2D)="white"{}
        [MainColor] _BaseColor("Leaf tint",Color)=(1,1,1,1)
        _Cutoff("Leaf edge",Range(0,1))=.35
        _LeafWindStrength("Leaf flutter",Range(0,.08))=.018
    }
    SubShader
    {
        Tags {"RenderPipeline"="UniversalPipeline" "RenderType"="TransparentCutout" "Queue"="AlphaTest"}
        Cull Off
        Pass
        {
            Name "Natural leaves"
            Tags {"LightMode"="UniversalForward"}
            AlphaToMask On
            HLSLPROGRAM
            #pragma target 3.0
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE
            #pragma multi_compile_fragment _ _SHADOWS_SOFT
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            TEXTURE2D(_BaseMap);SAMPLER(sampler_BaseMap);
            CBUFFER_START(UnityPerMaterial)
                float4 _BaseMap_ST;half4 _BaseColor;half _Cutoff;float _LeafWindStrength;
            CBUFFER_END
            struct Input {float4 positionOS:POSITION;float3 normalOS:NORMAL;float2 uv:TEXCOORD0;};
            struct Output {float4 positionCS:SV_POSITION;float3 positionWS:TEXCOORD0;half3 normalWS:TEXCOORD1;float2 uv:TEXCOORD2;half fog:TEXCOORD3;};
            Output Vert(Input v)
            {
                Output o;float3 p=TransformObjectToWorld(v.positionOS.xyz);
                float breeze=sin(p.x*1.8+p.z*.8+_Time.y*1.1)+.35*sin(p.z*3.7+_Time.y*1.9);
                // Wind runs on the GPU; there is no per-leaf phone update loop.
                p.xz+=float2(breeze,breeze*.45)*_LeafWindStrength*saturate(p.y*.65);
                o.positionWS=p;o.positionCS=TransformWorldToHClip(p);o.normalWS=TransformObjectToWorldNormal(v.normalOS);
                o.uv=TRANSFORM_TEX(v.uv,_BaseMap);o.fog=ComputeFogFactor(o.positionCS.z);return o;
            }
            half4 Frag(Output i):SV_Target
            {
                half4 leaf=SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,i.uv)*_BaseColor;
                clip(leaf.a-_Cutoff);
                half3 n=normalize(i.normalWS);Light sun=GetMainLight(TransformWorldToShadowCoord(i.positionWS));
                half wrapped=saturate((dot(n,sun.direction)+.45)/1.45);
                half3 light=SampleSH(n)*.9+sun.color*(.18+.62*wrapped)*lerp(.52,1,sun.shadowAttenuation);
                return half4(MixFog(leaf.rgb*light,i.fog),leaf.a);
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
        UsePass "Universal Render Pipeline/Lit/DepthOnly"
    }
    Fallback "Universal Render Pipeline/Lit"
}
