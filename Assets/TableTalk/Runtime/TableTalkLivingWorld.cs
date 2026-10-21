using System.Collections.Generic;
using UnityEngine;

namespace TableTalk
{
    public partial class TableTalkPresentation
    {
        sealed class WorldActor
        {
            public Transform root;
            public int kind;
            public bool east;
            public float phase, direction;
        }
        Transform worldMotion;
        readonly List<WorldActor> worldActors = new List<WorldActor>();
        readonly List<Transform> windRotors = new List<Transform>();
        Material riverSurface;
        float worldHalf, worldClock;
        bool worldMotionReduced;
        public int LivingWorldActorCount => worldActors.Count;
        public float LivingWorldClock => worldClock;
        public Vector3 TrafficSamplePosition => worldActors.Count == 0 ? Vector3.zero : worldActors[0].root.position;

        static float HighwayX(float half, float z, bool east) => east
            ? half + 2.7f + Mathf.Sin(z * .11f) * .65f
            : -half - 2.7f + Mathf.Sin(z * .1f + .7f) * .65f;
        static float RiverBankX(float half, float z) => half + 4.3f + Mathf.Sin(z * .09f + .5f) * .8f;

        void BuildLivingLandscape(float half)
        {
            worldHalf = half; worldClock = 0;
            // Moving objects stay outside the static batch, so cars never drag an entire road mesh.
            worldMotion = new GameObject("Living world · traffic, tractors, river boat").transform;
            worldMotion.SetParent(transform, false);
            BuildHighways(half); BuildFarmland(half); BuildRiver(half);
            string[] paint = { "#cc493e", "#e5bb4e", "#3974a1", "#edf0dc", "#3d4e55", "#f1eee4" };
            for (int side = 0; side < 2; side++) for (int lane = 0; lane < 2; lane++) for (int car = 0; car < 3; car++)
            {
                var root = WorldVehicle("Highway car", paint[(car + lane * 2 + side) % paint.Length], false);
                worldActors.Add(new WorldActor { root = root, east = side == 1, direction = lane == 0 ? 1 : -1, phase = car / 3f + .16f + side * .04f, kind = 0 });
            }
            for (int i = 0; i < 2; i++) worldActors.Add(new WorldActor { root = WorldVehicle("Working farm tractor", i == 0 ? "#c75735" : "#426e42", true), kind = 1, phase = i * .5f });
            var boat = new GameObject("River launch").transform; boat.SetParent(worldMotion, false);
            WorldBox(boat, "Blue hull", new Vector3(0, .025f, 0), new Vector3(.22f, .11f, .6f), "#2d697b");
            WorldBox(boat, "Ivory deck", new Vector3(0, .095f, .015f), new Vector3(.18f, .05f, .48f), "#fff4cf");
            WorldBox(boat, "Cabin", new Vector3(0, .18f, -.02f), new Vector3(.14f, .13f, .2f), "#e4f2ef");
            worldActors.Add(new WorldActor { root = boat, kind = 2, phase = .2f });
            TickLivingWorld();
        }

        void BuildHighways(float half)
        {
            var paving = new LandscapeMesh(); var asphalt = new LandscapeMesh();
            var markings = new LandscapeMesh(); var guardrails = new LandscapeMesh();
            for (int side = 0; side < 2; side++)
            {
                bool east = side == 1;
                for (int i = 0; i < 96; i++)
                {
                    float za = Mathf.Lerp(-half - 20, half + 20, i / 96f), zb = Mathf.Lerp(-half - 20, half + 20, (i + 1) / 96f);
                    Vector3 a = new Vector3(HighwayX(half, za, east), -.34f, za), b = new Vector3(HighwayX(half, zb, east), -.34f, zb);
                    Ribbon(paving, a - Vector3.up * .025f, b - Vector3.up * .025f, 1.95f);
                    Ribbon(asphalt, a, b, 1.6f);
                    Vector3 normal = Vector3.Cross((b-a).normalized, Vector3.up);
                    for (int edge = -1; edge <= 1; edge += 2)
                    {
                        Ribbon(markings, a + normal * .69f * edge + Vector3.up * .008f, b + normal * .69f * edge + Vector3.up * .008f, .025f);
                        Ribbon(guardrails, a + normal * .91f * edge + Vector3.up * .12f, b + normal * .91f * edge + Vector3.up * .12f, .035f);
                    }
                    if (i % 2 == 0) Ribbon(markings, a + Vector3.up * .009f, Vector3.Lerp(a,b,.7f) + Vector3.up * .009f, .035f);
                }
            }
            AddLandscapeMesh("Highway shoulders", paving, Material(ColorOf("#b5b9a8"), 0, .2f));
            AddLandscapeMesh("Curving two-lane highways", asphalt, Material(ColorOf("#414d51"), 0, .25f));
            AddLandscapeMesh("Highway lane paint", markings, Material(ColorOf("#eee9c6"), 0, .2f));
            AddLandscapeMesh("Highway safety rails", guardrails, Material(ColorOf("#a9b7b0"), .25f, .3f));
        }

        static void Ribbon(LandscapeMesh mesh, Vector3 a, Vector3 b, float width)
        {
            var n = Vector3.Cross((b-a).normalized, Vector3.up) * width * .5f;
            mesh.Plane(a+n, b+n, b-n, a-n);
        }

        void BuildFarmland(float half)
        {
            string[] soil = { "#877850", "#6f813e", "#bba65a", "#627e40" };
            string[] crop = { "#a4b957", "#93af43", "#d3c06d", "#719a4f" };
            var tracks = new LandscapeMesh();
            for (int row = 0; row < 4; row++) for (int column = 0; column < 2; column++)
            {
                int tone = (row + column) % 4;
                var centre = new Vector3(-half - 6.8f - column * 5.1f, -.365f, (row - 1.5f) * 5.5f);
                LandscapeBox("Cultivated field", centre, new Vector3(4.7f, .025f, 4.9f), Material(ColorOf(soil[tone]), 0, .05f));
                var rows = new LandscapeMesh();
                for (int stripe = 0; stripe < 22; stripe++) rows.SolidBox(centre + new Vector3(-2.15f + stripe * .205f, .035f, 0), new Vector3(.075f, .06f, 4.65f));
                AddLandscapeMesh("Parallel crop rows", rows, Material(ColorOf(crop[tone]), 0, .05f));
                tracks.SolidBox(centre + new Vector3(2.48f, -.005f, 0), new Vector3(.19f, .018f, 5.5f));
                tracks.SolidBox(centre + new Vector3(0, -.005f, 2.6f), new Vector3(5.1f, .018f, .21f));
            }
            AddLandscapeMesh("Farm access tracks", tracks, Material(ColorOf("#b2a36e"), 0, .1f));
            var barn = new Vector3(-half - 7.5f, -.3f, half + 2.6f);
            LandscapeBox("Farmhouse", barn + Vector3.up * .24f, new Vector3(.85f, .5f, 1.05f), Material(ColorOf("#d6bd91"), 0, .1f));
            LandscapeBox("Farmhouse roof", barn + Vector3.up * .53f, new Vector3(.98f, .1f, 1.18f), Material(ColorOf("#a74636"), 0, .1f));
            LandscapeBox("Barn doorway", barn + new Vector3(0,.15f,-.53f), new Vector3(.32f,.35f,.025f), Material(ColorOf("#514d3c"), 0, .1f));
            for (int i = 0; i < 2; i++)
            {
                var p = new Vector3(-half - 5.9f - i * 4.8f, -.35f, 3.4f - i * 6);
                LandscapeBox("Wind turbine tower", p + Vector3.up * 1.05f, new Vector3(.085f,2.1f,.085f), Material(ColorOf("#efeedc"), 0, .2f));
                var rotor = new GameObject("Turning turbine rotor").transform; rotor.SetParent(worldMotion, false); rotor.position = p + Vector3.up * 2.05f;
                for (int blade = 0; blade < 3; blade++)
                {
                    var arm = new GameObject("Blade arm").transform; arm.SetParent(rotor, false); arm.localRotation = Quaternion.Euler(0,0,blade*120);
                    WorldBox(arm, "Ivory blade", new Vector3(0,.47f,0), new Vector3(.09f,.86f,.035f), "#f4f0dc");
                }
                windRotors.Add(rotor);
            }
        }

        void BuildRiver(float half)
        {
            var bank = new LandscapeMesh(); var water = new LandscapeMesh(); var ripples = new LandscapeMesh();
            for (int i = 0; i < 88; i++)
            {
                float a = Mathf.Lerp(-half - 22, half + 22, i / 88f), b = Mathf.Lerp(-half - 22, half + 22, (i + 1) / 88f);
                float xa = RiverBankX(half,a), xb = RiverBankX(half,b);
                bank.Plane(new Vector3(xa-.65f,-.37f,a), new Vector3(xb-.65f,-.37f,b), new Vector3(xb+.5f,-.37f,b), new Vector3(xa+.5f,-.37f,a));
                water.Plane(new Vector3(xa,-.35f,a),new Vector3(xb,-.35f,b),new Vector3(xb+15,-.35f,b),new Vector3(xa+15,-.35f,a));
                if (i % 3 == 0) for (int j = 0; j < 4; j++)
                {
                    var p = new Vector3(xa + 1 + j * 1.45f + Hash(i+j) * .8f, -.342f, a);
                    ripples.Plane(p, p+Vector3.forward*.035f, p+new Vector3(.5f,.0f,.035f), p+Vector3.right*.5f);
                }
            }
            AddLandscapeMesh("Sandy riverbank", bank, Material(ColorOf("#cfc691"),0,.1f));
            riverSurface = Material(ColorOf("#4e9faa"), .12f,.65f);
            AddLandscapeMesh("Blue winding river", water, riverSurface);
            AddLandscapeMesh("Sunlit river ripples", ripples, Material(ColorOf("#a1d0c8"),0,.5f));
            float bridgeZ = -half * .65f;
            var c = new Vector3(half + 9, -.15f, bridgeZ);
            LandscapeBox("River bridge deck", c, new Vector3(12.5f,.18f,.85f),Material(ColorOf("#b9bba6"),0,.2f));
            LandscapeBox("Bridge carriageway", c+Vector3.up*.105f,new Vector3(12.5f,.035f,.65f),Material(ColorOf("#4b575a"),0,.2f));
            for (int edge = -1; edge <= 1; edge+=2) LandscapeBox("Bridge parapet",c+new Vector3(0,.25f,edge*.43f),new Vector3(12.5f,.15f,.055f),Material(ColorOf("#d9d6b8"),0,.2f));
        }

        Transform WorldVehicle(string name, string paint, bool tractor)
        {
            var root = new GameObject(name).transform; root.SetParent(worldMotion, false);
            WorldBox(root,"Dark chassis and tyres",new Vector3(0,.045f,0),new Vector3(.21f,.07f,.3f),"#263335");
            WorldBox(root,"Painted body",new Vector3(0,.09f,0),new Vector3(.18f,.09f,tractor?.31f:.37f),paint);
            WorldBox(root,"Glazed cabin",new Vector3(0,.155f,-.025f),new Vector3(.145f,tractor?.15f:.07f,.17f),"#a3c5cf");
            WorldBox(root,"Front lamps",new Vector3(0,.092f,.19f),new Vector3(.14f,.025f,.018f),"#fff5ce");
            return root;
        }

        Transform WorldBox(Transform parent, string name, Vector3 local, Vector3 scale, string colour)
        {
            var obj = GameObject.CreatePrimitive(PrimitiveType.Cube); obj.name=name; obj.transform.SetParent(parent,false); obj.transform.localPosition=local; obj.transform.localScale=scale;
            var material = Material(ColorOf(colour),0,.3f); material.enableInstancing=true;
            obj.GetComponent<Renderer>().sharedMaterial=material; Destroy(obj.GetComponent<BoxCollider>()); return obj.transform;
        }

        void TickLivingWorld()
        {
            if (worldMotion == null) return;
            if (!worldMotionReduced) worldClock += Time.unscaledDeltaTime;
            float range = worldHalf + 19;
            foreach (var actor in worldActors)
            {
                float z, x; Vector3 tangent;
                if (actor.kind == 0)
                {
                    z = Mathf.Lerp(-range, range, Mathf.Repeat(worldClock * .9f / (range*2) + actor.phase,1)) * actor.direction;
                    x = HighwayX(worldHalf,z,actor.east) - actor.direction*.3f;
                    tangent = new Vector3(HighwayX(worldHalf,z+.1f,actor.east)-HighwayX(worldHalf,z-.1f,actor.east),0,.2f)*actor.direction;
                    actor.root.SetPositionAndRotation(new Vector3(x,-.3f,z),Quaternion.LookRotation(tangent));
                }
                else if (actor.kind == 1)
                {
                    float t = Mathf.PingPong(worldClock*.1f+actor.phase*4,4)-2;
                    actor.root.SetPositionAndRotation(new Vector3(-worldHalf-6.8f-actor.phase*10,-.29f,t), Quaternion.Euler(0,worldClock*.1f%8<4?0:180,0));
                }
                else
                {
                    z = Mathf.Lerp(-range,range,Mathf.Repeat(worldClock*.35f/(range*2)+actor.phase,1));
                    actor.root.SetPositionAndRotation(new Vector3(RiverBankX(worldHalf,z)+1.1f,-.3f+Mathf.Sin(worldClock*1.3f)*.015f,z),Quaternion.Euler(0,5,0));
                }
            }
            for (int i=0;i<windRotors.Count;i++) windRotors[i].localRotation=Quaternion.Euler(0,0,worldClock*(24+i*4));
        }

        void DisposeLivingWorld()
        {
            if (worldMotion != null) Destroy(worldMotion.gameObject);
            worldActors.Clear(); windRotors.Clear(); worldMotion = null;
        }
    }
}
