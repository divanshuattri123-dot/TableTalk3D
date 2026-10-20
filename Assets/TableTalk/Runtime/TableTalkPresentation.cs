using System.Collections;
using System.Collections.Generic;
using System.Linq;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;

namespace TableTalk
{
    public partial class TableTalkPresentation : MonoBehaviour
    {
        public TokenAsset[] tokens;
        public TextAsset previewSnapshot;
        public Camera boardCamera;
        public Transform city;
        public Mesh houseMesh, hotelMesh;
        public Material cityMaterial;
        public TextMeshProUGUI statusText;
        public Canvas studioCanvas;
        public GameObject jailBars;
        public Vector3 jailMeshOffset;

        BoardSnapshot shown;
        Transform boardRoot, tokenRoot, propertyRoot;
        readonly Dictionary<string, Transform> pieces = new Dictionary<string, Transform>();
        readonly Dictionary<string, string> pieceModels = new Dictionary<string, string>();
        readonly Dictionary<int, Transform> tiles = new Dictionary<int, Transform>();
        readonly Dictionary<int, TextMeshPro> tileLabels = new Dictionary<int, TextMeshPro>();
        readonly Queue<BoardSnapshot> pending = new Queue<BoardSnapshot>();
        readonly List<Material> ownedMaterials = new List<Material>();
        readonly Dictionary<string, Material> materialCache = new Dictionary<string, Material>();
        Coroutine cameraMove, presentation;
        Vector2 pressedAt;
        bool dragging;
        float cameraZoom = 1;
        float previousAspect;
        public bool IsPresenting => presentation != null;
        public int PresentedEventId => shown == null ? -1 : shown.eventId;

        void Start()
        {
            Application.targetFrameRate = -1;
            QualitySettings.vSyncCount = 0;
#if UNITY_WEBGL && !UNITY_EDITOR
            BeginWeb();
#else
            if (previewSnapshot != null && shown == null) ApplySnapshot(previewSnapshot.text);
#endif
        }

        public void ApplySnapshot(string json)
        {
            var next = JsonUtility.FromJson<BoardSnapshot>(json);
            if (next == null || next.tiles == null || next.players == null) return;
            if (shown == null || next.roomCode != shown.roomCode || next.boardSize != shown.boardSize)
            {
                if (presentation != null) StopCoroutine(presentation);
                pending.Clear(); BuildBoard(next); shown = next; SyncInstant(next); WholeBoard();
                return;
            }
            pending.Enqueue(next);
            if (presentation == null) presentation = StartCoroutine(Present());
        }

        IEnumerator Present()
        {
            while (pending.Count > 0)
            {
                var next = pending.Dequeue();
                foreach (var player in next.players)
                {
                    var previous = shown.players.FirstOrDefault(p => p.id == player.id);
                    if (previous != null && pieces.TryGetValue(player.id, out var piece) && previous.position != player.position)
                    {
                        bool jail = player.inJail && !previous.inJail;
                        yield return Move(piece, previous.position, player.position, next.boardSize, jail);
                    }
                }
                shown = next; SyncInstant(next);
            }
            presentation = null;
        }

        void BuildBoard(BoardSnapshot state)
        {
            if (boardRoot != null) Destroy(boardRoot.gameObject);
            if (tokenRoot != null) Destroy(tokenRoot.gameObject);
            if (propertyRoot != null) Destroy(propertyRoot.gameObject);
            foreach (var material in ownedMaterials) Destroy(material);
            ownedMaterials.Clear(); materialCache.Clear(); pieces.Clear(); pieceModels.Clear(); tiles.Clear(); tileLabels.Clear();
            boardRoot = new GameObject("Readable board").transform;
            tokenRoot = new GameObject("Player tokens").transform;
            propertyRoot = new GameObject("Ownership and buildings").transform;
            Box(boardRoot, "Board rim", new Vector3(0, -.16f, 0),
                new Vector3(BoardLayout.Span(state.boardSize) + .18f, .45f, BoardLayout.Span(state.boardSize) + .18f), ColorOf("#486d57"));
            foreach (var tile in state.tiles)
            {
                var point = BoardLayout.Point(tile.id, state.boardSize); point.y = .07f;
                int quarter = tile.id / (state.boardSize / 4);
                var inward = quarter == 0 ? Vector3.forward : quarter == 1 ? Vector3.right : quarter == 2 ? Vector3.back : Vector3.left;
                var dimensions = BoardLayout.Size(tile.id, state.boardSize); dimensions.x -= .025f; dimensions.z -= .025f;
                var surface = Box(boardRoot, tile.name, point, dimensions, ColorOf("#cee8cd"));
                surface.gameObject.AddComponent<TilePick>().position = tile.id; tiles[tile.id] = surface;
                if (tile.kind == "property")
                {
                    var stripe = point; stripe.y = .157f;
                    stripe += inward * .55f;
                    var stripSize = dimensions; stripSize.y = .012f;
                    if (tile.id / (state.boardSize / 4) % 2 == 0) stripSize.z = .19f; else stripSize.x = .19f;
                    Box(boardRoot, tile.name + " colour", stripe, stripSize, ColorOf(tile.color));
                }
                var label = new GameObject("Label", typeof(RectTransform), typeof(TextMeshPro));
                label.transform.SetParent(boardRoot, false); label.transform.localScale = Vector3.one;
                label.transform.position = new Vector3(point.x, .164f, point.z) - inward * (tile.kind == "property" ? .13f : 0);
                label.transform.rotation = Quaternion.Euler(90, 0, 0);
                var text = label.GetComponent<TextMeshPro>();
                tileLabels[tile.id] = text;
                text.color = ColorOf("#17392e"); text.fontSize = 2.55f; text.fontStyle = FontStyles.Bold;
                text.enableAutoSizing = true; text.fontSizeMin = 1.55f; text.fontSizeMax = 2.55f;
                text.alignment = TextAlignmentOptions.Center; text.textWrappingMode = TextWrappingModes.Normal;
                text.rectTransform.sizeDelta = tile.kind != "property" ? new Vector2(dimensions.x - .16f, dimensions.z - .16f)
                    : quarter % 2 == 0 ? new Vector2(dimensions.x - .12f, dimensions.z - .4f) : new Vector2(dimensions.x - .4f, dimensions.z - .12f);
            }
            if (city != null) city.localScale = Vector3.one * (state.boardSize / 4f - 1.45f);
            BuildLandscape(state.boardSize);
            SyncLabels(state);
        }

        void SyncLabels(BoardSnapshot state)
        {
            foreach (var tile in state.tiles)
            {
                if (!tileLabels.TryGetValue(tile.id, out var label)) continue;
                string title = string.IsNullOrEmpty(tile.boardLabel) ? tile.name : tile.boardLabel;
                string symbol = string.IsNullOrEmpty(state.currencySymbol) ? "Rs " : state.currencySymbol;
                if (symbol == "₹" && !label.font.HasCharacter('₹')) symbol = "Rs ";
                string region = string.IsNullOrEmpty(tile.region) ? "" : "\n<size=60%><color=#567360>" + tile.region.Split('·')[0].Trim() + "</color></size>";
                label.text = title + region + (tile.price > 0 ? "\n<b>" + symbol + tile.price + "</b>" : "");
            }
        }

        void SyncInstant(BoardSnapshot state)
        {
            SyncLabels(state);
            foreach (var player in state.players)
            {
                if (!pieces.TryGetValue(player.id, out var piece))
                {
                    piece = new GameObject(player.name + " token").transform; piece.SetParent(tokenRoot);
                    var plinth = GameObject.CreatePrimitive(PrimitiveType.Cylinder); plinth.name = "Player colour";
                    plinth.transform.SetParent(piece, false); plinth.transform.localPosition = new Vector3(0, -.045f, 0);
                    plinth.transform.localScale = new Vector3(.6f, .035f, .6f);
                    plinth.GetComponent<Renderer>().sharedMaterial = Material(ColorOf(player.color), .15f, .45f);
                    Destroy(plinth.GetComponent<CapsuleCollider>()); pieces[player.id] = piece;
                }
                UpdateTokenModel(piece, player);
                piece.gameObject.SetActive(!player.bankrupt);
                piece.position = BoardLayout.Point(player.position, state.boardSize);
                int overlap = System.Array.FindIndex(state.players, p => p.id == player.id);
                piece.position += new Vector3((overlap % 3 - 1) * .19f, 0, (overlap / 3) * .22f);
            }
            SyncProperties(state);
            if (jailBars != null)
            {
                jailBars.transform.position = BoardLayout.Point(state.boardSize / 4, state.boardSize) + jailMeshOffset;
                jailBars.SetActive(state.players.Any(p => p.inJail && !p.bankrupt));
            }
            if (statusText != null)
            {
                var active = state.players.FirstOrDefault(p => p.id == state.activePlayerId);
                statusText.text = state.roomCode == "STUDIO" ? "Graphics studio · animation preview, not a live match" : (active?.name ?? "Room") + " · " + state.phase;
            }
        }

        void SyncProperties(BoardSnapshot state)
        {
            foreach (Transform child in propertyRoot) Destroy(child.gameObject);
            foreach (var tile in state.tiles)
                if (tiles.TryGetValue(tile.id, out var surface)) surface.GetComponent<Renderer>().sharedMaterial = Material(ColorOf(tile.mortgaged ? "#d75b62" : "#cee8cd"), .04f, .26f);
            foreach (var tile in state.tiles.Where(t => !string.IsNullOrEmpty(t.ownerId)))
            {
                var owner = state.players.FirstOrDefault(p => p.id == tile.ownerId);
                if (owner == null) continue;
                var point = BoardLayout.Point(tile.id, state.boardSize);
                var outward = new Vector3(point.x, 0, point.z).normalized;
                Box(propertyRoot, tile.name + " owner", point + outward * .76f, new Vector3(.35f, .08f, .2f), ColorOf(tile.mortgaged ? "#c92d3e" : owner.color));
                int count = tile.houses == 5 ? 1 : tile.houses;
                for (int i = 0; i < count; i++)
                {
                    var mesh = tile.houses == 5 ? hotelMesh : houseMesh;
                    if (mesh == null) continue;
                    var obj = new GameObject(tile.houses == 5 ? "Hotel" : "House", typeof(MeshFilter), typeof(MeshRenderer));
                    obj.transform.SetParent(propertyRoot, false); obj.GetComponent<MeshFilter>().sharedMesh = mesh;
                    float scale = (tile.houses == 5 ? .42f : .22f) / Mathf.Max(mesh.bounds.size.x, mesh.bounds.size.y, mesh.bounds.size.z, .001f);
                    obj.transform.localScale = Vector3.one * scale;
                    obj.transform.position = point - mesh.bounds.center * scale + Vector3.up * .12f;
                    if (tile.houses != 5) obj.transform.position += new Vector3((i % 2 - .5f) * .28f, 0, (i / 2 - .5f) * .28f);
                    var renderer = obj.GetComponent<MeshRenderer>(); renderer.sharedMaterial = Material(ColorOf(tile.houses == 5 ? "#ed3446" : "#24b66d"), .1f, .35f);
                    renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
                }
            }
        }

        void UpdateTokenModel(Transform piece, PlayerSnapshot player)
        {
            var asset = tokens.FirstOrDefault(t => t.id == player.tokenId) ?? tokens.FirstOrDefault();
            if (asset?.prefab == null || (pieceModels.TryGetValue(player.id, out var id) && id == asset.id)) return;
            var position = piece.position; var facing = piece.rotation;
            piece.SetPositionAndRotation(Vector3.zero, Quaternion.identity);
            var old = piece.Find("Token visual"); if (old != null) Destroy(old.gameObject);
            var model = Instantiate(asset.prefab, piece); model.name = "Token visual"; model.SetActive(true);
            var bounds = BoundsOf(model); float size = Mathf.Max(bounds.size.x, bounds.size.y, bounds.size.z, .001f);
            model.transform.localScale *= .68f / size;
            model.transform.localPosition = new Vector3(-bounds.center.x, -bounds.min.y, -bounds.center.z) * (.68f / size);
            var silver = Material(ColorOf("#d7e4ee"), .75f, .55f);
            foreach (var render in model.GetComponentsInChildren<MeshRenderer>()) { render.enabled = true; render.sharedMaterial = silver; render.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On; }
            piece.SetPositionAndRotation(position, facing);
            pieceModels[player.id] = asset.id;
        }

        IEnumerator Move(Transform piece, int from, int to, int size, bool directJail)
        {
            int count = BoardLayout.ForwardSteps(from, to, size);
            if (directJail)
            {
                var origin = piece.position; var destination = BoardLayout.Point(to, size);
                for (float t = 0; t < 1; t += Time.unscaledDeltaTime / 1.15f)
                { piece.position = Vector3.Lerp(origin, destination, Smooth(t)) + Vector3.up * Mathf.Sin(t * Mathf.PI) * 2.4f; yield return null; }
            }
            else for (int step = 1; step <= count; step++)
            {
                var origin = piece.position; var destination = BoardLayout.Point((from + step) % size, size);
                var direction = destination - origin; direction.y = 0;
                if (direction.sqrMagnitude > .001f) piece.rotation = Quaternion.LookRotation(direction);
                for (float t = 0; t < 1; t += Time.unscaledDeltaTime / .17f)
                { piece.position = Vector3.Lerp(origin, destination, Smooth(t)) + Vector3.up * Mathf.Sin(t * Mathf.PI) * .2f; yield return null; }
                piece.position = destination;
            }
        }

        public void PreviewAnimation()
        {
            if (shown == null || shown.roomCode != "STUDIO" || presentation != null) return;
            var next = JsonUtility.FromJson<BoardSnapshot>(JsonUtility.ToJson(shown));
            var player = next.players[0]; player.position = (player.position + 7) % next.boardSize;
            next.eventId++; ApplySnapshot(JsonUtility.ToJson(next));
        }

        public void PreviewJail()
        {
            if (shown == null || shown.roomCode != "STUDIO" || presentation != null) return;
            var next = JsonUtility.FromJson<BoardSnapshot>(JsonUtility.ToJson(shown));
            var player = next.players[0]; player.position = next.boardSize / 4; player.inJail = true;
            next.eventId++; ApplySnapshot(JsonUtility.ToJson(next));
        }

        public void WholeBoard() { cameraZoom = 1; CameraTo(Vector3.zero, false); }
        public void FocusActive()
        {
            var active = shown?.players.FirstOrDefault(p => p.id == shown.activePlayerId);
            if (active != null) { cameraZoom = 2.15f; CameraTo(BoardLayout.Point(active.position, shown.boardSize), false); }
        }
        public void CameraTo(Vector3 target, bool tilted)
        {
            if (cameraMove != null) StopCoroutine(cameraMove);
            cameraMove = StartCoroutine(EaseCamera(target, tilted));
        }
        IEnumerator EaseCamera(Vector3 target, bool tilted)
        {
            float distance = BoardLayout.Span(shown?.boardSize ?? 40) * 2.05f / cameraZoom * Mathf.Max(1, 1 / boardCamera.aspect);
            Vector3 destination = target + new Vector3(0, distance, -distance * (tilted || angledView ? .7f : .24f));
            Quaternion rotation = Quaternion.LookRotation(target - destination);
            var origin = boardCamera.transform.position; var facing = boardCamera.transform.rotation;
            for (float t = 0; t < 1; t += Time.unscaledDeltaTime / .7f)
            { boardCamera.transform.SetPositionAndRotation(Vector3.Lerp(origin, destination, Smooth(t)), Quaternion.Slerp(facing, rotation, Smooth(t))); yield return null; }
            boardCamera.transform.SetPositionAndRotation(destination, rotation);
            cameraMove = null;
        }

        void Update()
        {
            if (boardCamera != null && Mathf.Abs(previousAspect - boardCamera.aspect) > .001f)
            {
                previousAspect = boardCamera.aspect;
                if (cameraZoom == 1) WholeBoard();
            }
            var pointer = Pointer.current;
            if (pointer == null || boardCamera == null || shown == null) return;
            var point = pointer.position.ReadValue();
            if (pointer.press.wasPressedThisFrame) { pressedAt = point; dragging = false; }
            if (pointer.press.isPressed && (point - pressedAt).sqrMagnitude > 64) dragging = true;
            if (pointer.press.wasReleasedThisFrame && !dragging)
            {
                if (!boardCamera.pixelRect.Contains(point)) return;
                if (UnityEngine.EventSystems.EventSystem.current != null && UnityEngine.EventSystems.EventSystem.current.IsPointerOverGameObject()) return;
                if (Physics.Raycast(boardCamera.ScreenPointToRay(point), out var hit) && hit.collider.TryGetComponent<TilePick>(out var selected))
                {
                    EmitWeb("select", selected.position.ToString());
                    var tile = shown.tiles.FirstOrDefault(t => t.id == selected.position);
                    if (tile != null && statusText != null)
                    {
                        statusText.text = tile.name + (tile.price > 0 ? " · Rs " + tile.price : "");
                        cameraZoom = 2.15f; CameraTo(BoardLayout.Point(tile.id, shown.boardSize), false);
                    }
                }
            }
        }

        Transform Box(Transform parent, string name, Vector3 position, Vector3 scale, Color color)
        {
            var obj = GameObject.CreatePrimitive(PrimitiveType.Cube); obj.name = name; obj.transform.SetParent(parent);
            obj.transform.position = position; obj.transform.localScale = scale;
            obj.GetComponent<Renderer>().sharedMaterial = Material(color, .04f, .26f); return obj.transform;
        }
        Material Material(Color color, float metallic, float smoothness)
        {
            string key = ColorUtility.ToHtmlStringRGBA(color) + ":" + metallic + ":" + smoothness;
            if (materialCache.TryGetValue(key, out var cached)) return cached;
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) throw new System.InvalidOperationException("URP/Lit is unavailable.");
            var material = new Material(shader); material.color = color;
            material.SetFloat("_Metallic", metallic); material.SetFloat("_Smoothness", smoothness);
            ownedMaterials.Add(material); materialCache[key] = material; return material;
        }
        static Bounds BoundsOf(GameObject obj)
        {
            var renders = obj.GetComponentsInChildren<Renderer>();
            var bounds = new Bounds(obj.transform.position, Vector3.zero);
            foreach (var render in renders) bounds.Encapsulate(render.bounds); return bounds;
        }
        static float Smooth(float t) => t * t * (3 - 2 * t);
        static Color ColorOf(string hex) => ColorUtility.TryParseHtmlString(hex, out var color) ? color : Color.white;
        void OnDestroy()
        {
            DisposeLandscape();
            foreach (var material in ownedMaterials) if (material != null) Destroy(material);
            foreach (var model in streamedModels) if (model != null) Destroy(model);
            foreach (var mesh in streamedMeshes) if (mesh != null) Destroy(mesh);
        }
    }
    public class TilePick : MonoBehaviour { public int position; }
}
