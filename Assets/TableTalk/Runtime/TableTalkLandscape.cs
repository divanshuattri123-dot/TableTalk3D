using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace TableTalk
{
    public partial class TableTalkPresentation
    {
        Transform landscape;
        readonly List<Mesh> landscapeMeshes = new List<Mesh>();
        readonly List<Texture2D> landscapeTextures = new List<Texture2D>();

        void BuildLandscape(int size)
        {
            DisposeLandscape();
            landscape = new GameObject("Riverside park · trees and promenade").transform;
            float half = BoardLayout.Span(size) * .5f;
            var grass = Material(ColorOf("#729450"), 0, .12f);
            var grassMap = new Texture2D(128, 128, TextureFormat.RGB24, true) { name = "Fine grass grain", wrapMode = TextureWrapMode.Repeat };
            var grassPixels = new Color[128 * 128];
            for (int y = 0; y < 128; y++) for (int x = 0; x < 128; x++)
            {
                float noise = Hash(x * 3.1f + y * 71.9f);
                grassPixels[y * 128 + x] = Color.Lerp(ColorOf("#7b9951"), ColorOf("#b0bf7b"), noise * .65f);
            }
            grassMap.SetPixels(grassPixels); grassMap.Apply(true, true); landscapeTextures.Add(grassMap);
            grass.SetTexture("_BaseMap", grassMap); grass.SetTextureScale("_BaseMap", Vector2.one * 18);
            LandscapeBox("Parkland", new Vector3(0, -.47f, 0), new Vector3(half * 2 + 40, .15f, half * 2 + 40), grass);
            var path = Material(ColorOf("#c7bf9e"), 0, .15f);
            var road = Material(ColorOf("#3f4a49"), 0, .12f);
            var curb = Material(ColorOf("#e8dfbb"), 0, .2f);
            float roadEdge = half + 1.4f;
            for (int side = 0; side < 4; side++)
            {
                bool horizontal = side % 2 == 0;
                float sign = side < 2 ? 1 : -1;
                Vector3 p = horizontal ? new Vector3(0, -.365f, roadEdge * sign) : new Vector3(roadEdge * sign, -.365f, 0);
                LandscapeBox("Tree-lined avenue", p, horizontal ? new Vector3(roadEdge * 2 + 1.25f, .035f, 1.25f) : new Vector3(1.25f, .035f, roadEdge * 2 + 1.25f), road);
                for (int edge = -1; edge <= 1; edge += 2)
                {
                    var offset = horizontal ? new Vector3(0, .015f, edge * .72f) : new Vector3(edge * .72f, .015f, 0);
                    LandscapeBox("Paved promenade", p + offset, horizontal ? new Vector3(roadEdge * 2 + 1.5f, .055f, .2f) : new Vector3(.2f, .055f, roadEdge * 2 + 1.5f), path);
                }
                for (float along = -roadEdge + .7f; along < roadEdge; along += .72f)
                {
                    var dash = p + (horizontal ? Vector3.right : Vector3.forward) * along + Vector3.up * .025f;
                    LandscapeBox("Avenue lane marking", dash, horizontal ? new Vector3(.3f, .006f, .028f) : new Vector3(.028f, .006f, .3f), curb);
                }
            }

            var bark = Material(ColorOf("#76634b"), 0, .08f);
            var branchMesh = new LandscapeMesh();
            var crowns = new[] { new LandscapeMesh(), new LandscapeMesh(), new LandscapeMesh(), new LandscapeMesh() };
            var foliageColors = new[] { "#456f35", "#5a823b", "#729346", "#3c6940" };
            int treeCount = size > 48 ? 136 : 112;
            for (int i = 0; i < treeCount; i++)
            {
                int side = i % 4;
                float along = (Hash(i * 7.1f + 2) * 2 - 1) * (half + 12);
                float across = half + 2.7f + Hash(i * 5.3f + 8) * 9;
                Vector3 root = side % 2 == 0 ? new Vector3(along, -.39f, across * (side == 0 ? 1 : -1)) : new Vector3(across * (side == 1 ? 1 : -1), -.39f, along);
                float height = 1.1f + Hash(i * 19.7f) * 1.7f;
                float width = .45f + Hash(i * 13.2f) * .35f;
                var top = root + new Vector3((Hash(i + 3) - .5f) * .2f, height * .73f, (Hash(i + 8) - .5f) * .2f);
                branchMesh.Branch(root, top, .07f + height * .016f, .025f);
                for (int limb = 0; limb < 7; limb++)
                {
                    float angle = limb * 2.39996f + i * .7f;
                    float reach = width * (.6f + Hash(i * 3 + limb) * .5f);
                    var end = top + new Vector3(Mathf.Cos(angle) * reach, (limb / 7f - .25f) * height * .5f, Mathf.Sin(angle) * reach);
                    branchMesh.Branch(Vector3.Lerp(root, top, .55f + limb * .05f), end, .032f, .009f);
                    crowns[(i + limb / 2) % 4].Crown(end, new Vector3(width * .78f, height * .26f, width * .74f), i * 31 + limb);
                }
                crowns[i % 4].Crown(top + Vector3.up * height * .25f, new Vector3(width * .74f, height * .29f, width * .8f), i + 211);
            }
            AddLandscapeMesh("Branching hardwood trunks", branchMesh, bark);
            for (int i = 0; i < crowns.Length; i++)
            {
                var leaves = Material(ColorOf(foliageColors[i]), 0, .08f);
                leaves.SetTexture("_BaseMap", FoliageTexture(i));
                leaves.SetFloat("_AlphaClip", 1); leaves.SetFloat("_Cutoff", .33f); leaves.SetFloat("_Cull", 0);
                leaves.EnableKeyword("_ALPHATEST_ON"); leaves.renderQueue = 2450;
                AddLandscapeMesh("Layered leaf canopy " + i, crowns[i], leaves);
            }
            var shrubs = new LandscapeMesh();
            for (int i = 0; i < 72; i++)
            {
                float angle = i * 2.39996f;
                float radius = half + 3.2f + Hash(i + 700) * 8;
                var p = new Vector3(Mathf.Cos(angle), 0, Mathf.Sin(angle)) * radius;
                if (Mathf.Max(Mathf.Abs(p.x), Mathf.Abs(p.z)) < half + 2.3f) continue;
                shrubs.Crown(p + Vector3.down * .2f, new Vector3(.25f, .2f, .32f), i);
            }
            AddLandscapeMesh("Low garden planting", shrubs, Material(ColorOf("#839858"), 0, .1f));
            StaticBatchingUtility.Combine(landscape.gameObject);
        }

        Texture2D FoliageTexture(int seed)
        {
            const int size = 128;
            var texture = new Texture2D(size, size, TextureFormat.RGBA32, true) { name = "Dappled leaves " + seed, wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Trilinear };
            var pixels = new Color[size * size];
            for (int i = 0; i < 470; i++)
            {
                float cx = Hash(i * 11.31f + seed) * size, cy = Hash(i * 7.13f + seed * 3) * size;
                float rx = 2 + Hash(i * 4.7f) * 4, ry = 2 + Hash(i * 3.1f) * 2;
                float light = .67f + Hash(i + seed * 44) * .33f;
                for (int y = -7; y <= 7; y++) for (int x = -7; x <= 7; x++)
                {
                    if (x * x / (rx * rx) + y * y / (ry * ry) > 1) continue;
                    int px = (Mathf.FloorToInt(cx) + x + size) % size, py = (Mathf.FloorToInt(cy) + y + size) % size;
                    pixels[py * size + px] = new Color(light, light, light * .82f, 1);
                }
            }
            texture.SetPixels(pixels); texture.Apply(true, true); landscapeTextures.Add(texture); return texture;
        }

        void LandscapeBox(string name, Vector3 position, Vector3 scale, Material material)
        {
            var obj = GameObject.CreatePrimitive(PrimitiveType.Cube); obj.name = name; obj.transform.SetParent(landscape, false);
            obj.transform.position = position; obj.transform.localScale = scale;
            obj.GetComponent<Renderer>().sharedMaterial = material;
            Destroy(obj.GetComponent<Collider>());
        }

        void AddLandscapeMesh(string name, LandscapeMesh source, Material material)
        {
            var mesh = source.Build(name); landscapeMeshes.Add(mesh);
            var obj = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer)); obj.transform.SetParent(landscape, false);
            obj.GetComponent<MeshFilter>().sharedMesh = mesh;
            var renderer = obj.GetComponent<MeshRenderer>(); renderer.sharedMaterial = material;
            renderer.shadowCastingMode = ShadowCastingMode.On; renderer.receiveShadows = true;
        }

        void DisposeLandscape()
        {
            if (landscape != null) Destroy(landscape.gameObject);
            foreach (var mesh in landscapeMeshes) if (mesh != null) Destroy(mesh);
            foreach (var texture in landscapeTextures) if (texture != null) Destroy(texture);
            landscapeMeshes.Clear(); landscapeTextures.Clear();
        }

        static float Hash(float seed) => Mathf.Repeat(Mathf.Sin(seed * 127.1f + 311.7f) * 43758.5453f, 1);

        sealed class LandscapeMesh
        {
            readonly List<Vector3> vertices = new List<Vector3>();
            readonly List<Vector2> uvs = new List<Vector2>();
            readonly List<int> triangles = new List<int>();

            public void Branch(Vector3 from, Vector3 to, float radius, float tip)
            {
                int start = vertices.Count;
                var rotation = Quaternion.FromToRotation(Vector3.up, (to - from).normalized);
                for (int row = 0; row <= 1; row++) for (int side = 0; side <= 6; side++)
                {
                    float angle = side * Mathf.PI / 3, r = row == 0 ? radius : tip;
                    vertices.Add((row == 0 ? from : to) + rotation * new Vector3(Mathf.Cos(angle) * r, 0, Mathf.Sin(angle) * r));
                    uvs.Add(new Vector2(side / 6f, row));
                }
                for (int side = 0; side < 6; side++) Quad(start + side, start + side + 7, start + side + 8, start + side + 1);
            }

            public void Crown(Vector3 centre, Vector3 scale, int seed)
            {
                const int rings = 6, sides = 10;
                int start = vertices.Count;
                for (int row = 0; row <= rings; row++) for (int side = 0; side <= sides; side++)
                {
                    float v = row / (float)rings, u = side / (float)sides, latitude = v * Mathf.PI, angle = u * Mathf.PI * 2;
                    float rough = .82f + Hash(seed * 19.1f + row * 7 + side % sides) * .32f;
                    var p = new Vector3(Mathf.Sin(latitude) * Mathf.Cos(angle), Mathf.Cos(latitude), Mathf.Sin(latitude) * Mathf.Sin(angle));
                    vertices.Add(centre + Vector3.Scale(p * rough, scale)); uvs.Add(new Vector2(u, v));
                }
                for (int row = 0; row < rings; row++) for (int side = 0; side < sides; side++)
                {
                    int i = start + row * (sides + 1) + side;
                    Quad(i, i + 1, i + sides + 2, i + sides + 1);
                }
            }

            void Quad(int a, int b, int c, int d) { triangles.Add(a); triangles.Add(b); triangles.Add(c); triangles.Add(a); triangles.Add(c); triangles.Add(d); }
            public Mesh Build(string name)
            {
                var mesh = new Mesh { name = name, indexFormat = IndexFormat.UInt32 };
                mesh.SetVertices(vertices); mesh.SetUVs(0, uvs); mesh.SetTriangles(triangles, 0); mesh.RecalculateNormals(); mesh.RecalculateBounds(); return mesh;
            }
        }
    }
}
