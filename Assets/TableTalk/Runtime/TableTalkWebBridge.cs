using System;
using System.Collections;
using System.Linq;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Scripting;

namespace TableTalk
{
    [Serializable] public class MotionFrame
    {
        public string id, kind, text, playerId, diceId;
        public int tileId, duration;
        public int[] route, dice;
        public BoardSnapshot board;
    }

    public partial class TableTalkPresentation
    {
        public GameObject dicePrefab;
        bool webMode;
        Coroutine webMotion;
        Transform diceRoot;
        readonly Transform[] dicePieces = new Transform[2];
        string lastFrameId;
        string currentDiceId;
        GameObject defaultDicePrefab;
        readonly System.Collections.Generic.List<Mesh> streamedMeshes = new System.Collections.Generic.List<Mesh>();
        readonly System.Collections.Generic.List<GameObject> streamedModels = new System.Collections.Generic.List<GameObject>();
        Vector2 lastDrag;
        float pinchDistance;
        bool angledView;
        [Serializable] public class VisualSettings { public string quality, theme, camera; public bool mobile, reducedMotion, screenLabels; }
        public string CompletedFrameId { get; private set; }
        public bool WebMotionPlaying => webMotion != null;
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void TableTalkEvent(string kind, string value);
#endif
        void EmitWeb(string kind, string value)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            TableTalkEvent(kind, value);
#endif
        }

        [Preserve] public void BeginWeb()
        {
            webMode = true;
            if (defaultDicePrefab == null) defaultDicePrefab = dicePrefab;
            if (studioCanvas != null) studioCanvas.gameObject.SetActive(false);
            boardCamera.rect = new Rect(0, 0, 1, 1);
#if UNITY_WEBGL && !UNITY_EDITOR
            WebGLInput.captureAllKeyboardInput = false;
#endif
            EmitWeb("ready", "1");
        }

        [Preserve] public void SetVisualSettings(string json)
        {
            var settings = JsonUtility.FromJson<VisualSettings>(json);
            if (settings == null) return;
            bool low = settings.quality == "low" || settings.quality == "auto" && settings.mobile;
            bool night = settings.theme == "night";
            angledView = settings.camera == "perspective";
            ConfigureScreenLabels(settings.screenLabels);
            QualitySettings.shadowDistance = low ? 18 : 38;
            QualitySettings.shadowResolution = low ? ShadowResolution.Low : ShadowResolution.Medium;
            if (RenderSettings.sun != null)
            {
                RenderSettings.sun.intensity = night ? .8f : 2.1f;
                RenderSettings.sun.color = ColorOf(night ? "#a9c6ec" : "#fff7df");
            }
            RenderSettings.ambientSkyColor = ColorOf(night ? "#718bb4" : "#c7dcf6");
            RenderSettings.ambientEquatorColor = ColorOf(night ? "#506d78" : "#a5bdba");
            if (shown != null) WholeBoard();
        }

        [Preserve] public void ResetSnapshot(string json)
        {
            if (!webMode) BeginWeb();
            StopAllCoroutines(); presentation = null; cameraMove = null; webMotion = null;
            pending.Clear(); shown = null; lastFrameId = null;
            if (diceRoot != null) { Destroy(diceRoot.gameObject); diceRoot = null; }
            ApplySnapshot(json);
        }

        [Preserve] public void SyncSnapshot(string json)
        {
            var state = JsonUtility.FromJson<BoardSnapshot>(json);
            if (shown == null || state.boardSize != shown.boardSize || state.roomCode != shown.roomCode) { ResetSnapshot(json); return; }
            shown = state; SyncInstant(state);
            if (state.phase == "awaitingRoll") WholeBoard();
        }

        [Preserve] public void PresentFrame(string json)
        {
            var frame = JsonUtility.FromJson<MotionFrame>(json);
            if (frame == null || frame.id == lastFrameId) return;
            lastFrameId = frame.id;
            if (webMotion != null) StopCoroutine(webMotion);
            webMotion = StartCoroutine(PlayFrame(frame));
        }

        IEnumerator PlayFrame(MotionFrame frame)
        {
            float began = Time.unscaledTime, seconds = Mathf.Max(.05f, frame.duration / 1000f);
            pieces.TryGetValue(frame.playerId ?? "", out var piece);
            if (frame.kind == "dice")
            {
                if (frame.diceId != currentDiceId)
                {
                    var asset = tokens.FirstOrDefault(t => t.id == frame.diceId);
                    dicePrefab = asset != null ? asset.prefab : defaultDicePrefab;
                    if (diceRoot != null) { Destroy(diceRoot.gameObject); diceRoot = null; }
                    currentDiceId = frame.diceId;
                }
                yield return TumbleDice(frame.dice, seconds);
            }
            else if (frame.kind == "move" && piece != null && frame.route != null)
            {
                cameraZoom = 1.35f; CameraTo(piece.position * .55f, false);
                foreach (int position in frame.route)
                {
                    var origin = piece.position; var destination = BoardLayout.Point(position, shown.boardSize);
                    var direction = destination - origin; direction.y = 0;
                    var facing = direction.sqrMagnitude > .001f ? Quaternion.LookRotation(direction) : piece.rotation;
                    var rotation = piece.rotation;
                    for (float t = 0; t < 1; t += Time.unscaledDeltaTime / .17f)
                    {
                        piece.position = Vector3.Lerp(origin, destination, Smooth(t)) + Vector3.up * Mathf.Sin(t * Mathf.PI) * .24f;
                        piece.rotation = Quaternion.Slerp(rotation, facing, Smooth(t)); yield return null;
                    }
                    piece.position = destination;
                }
                cameraZoom = 1.8f; CameraTo(piece.position, true);
            }
            else if (frame.kind == "jail" && piece != null)
            {
                WholeBoard();
                var origin = piece.position; var destination = BoardLayout.Point(shown.boardSize / 4, shown.boardSize);
                for (float t = 0; t < 1; t += Time.unscaledDeltaTime / 1.15f)
                {
                    piece.position = Vector3.Lerp(origin, destination, Smooth(t)) + Vector3.up * Mathf.Sin(t * Mathf.PI) * 2.1f;
                    yield return null;
                }
                piece.position = destination; cameraZoom = 2; CameraTo(destination, true);
                if (jailBars != null)
                {
                    jailBars.SetActive(true); var bottom = destination + jailMeshOffset;
                    for (float t = 0; t < 1; t += Time.unscaledDeltaTime / .45f)
                    { jailBars.transform.position = bottom + Vector3.up * (1 - Smooth(t)) * 2; yield return null; }
                    jailBars.transform.position = bottom;
                }
            }
            else if (frame.kind == "release" && jailBars != null)
            {
                var origin = jailBars.transform.position;
                for (float t = 0; t < 1; t += Time.unscaledDeltaTime / .7f)
                { jailBars.transform.position = origin + Vector3.up * Smooth(t) * 2.8f; yield return null; }
                jailBars.SetActive(false);
            }
            else if (frame.kind == "build" || frame.kind == "mortgage" || frame.kind == "purchase" || frame.kind == "sold")
            {
                if (frame.board != null) SyncProperties(frame.board);
                cameraZoom = 1.8f; CameraTo(BoardLayout.Point(frame.tileId, shown.boardSize), true);
                if (tiles.TryGetValue(frame.tileId, out var tile))
                {
                    var origin = tile.position; var facing = tile.rotation;
                    for (float t = 0; t < 1; t += Time.unscaledDeltaTime / .8f)
                    {
                        tile.position = origin + Vector3.up * Mathf.Sin(t * Mathf.PI) * .22f;
                        if (frame.kind == "mortgage") tile.rotation = facing * Quaternion.Euler(0, 0, 360 * Smooth(t));
                        yield return null;
                    }
                    tile.SetPositionAndRotation(origin, facing);
                }
                if (frame.kind == "build")
                {
                    for (float t = 0; t < 1; t += Time.unscaledDeltaTime / .35f)
                    { propertyRoot.localScale = Vector3.one * (1 + Mathf.Sin(t * Mathf.PI) * .025f); yield return null; }
                    propertyRoot.localScale = Vector3.one;
                }
            }
            else if (frame.kind == "turn") WholeBoard();
            while (Time.unscaledTime - began < seconds) yield return null;
            CompletedFrameId = frame.id; webMotion = null;
            EmitWeb("complete", frame.id);
        }

        void MakeDice()
        {
            if (diceRoot != null) return;
            diceRoot = new GameObject("Tumbling dice").transform;
            for (int die = 0; die < 2; die++)
            {
                var root = new GameObject("Die " + die).transform; root.SetParent(diceRoot, false); dicePieces[die] = root;
                var body = dicePrefab != null ? Instantiate(dicePrefab, root) : GameObject.CreatePrimitive(PrimitiveType.Cube);
                if (body.transform.parent != root) body.transform.SetParent(root, false);
                body.SetActive(true);
                foreach (var renderer in body.GetComponentsInChildren<Renderer>()) renderer.enabled = true;
                var bounds = BoundsOf(body); float scale = 1 / Mathf.Max(bounds.size.x, bounds.size.y, bounds.size.z, .001f);
                body.transform.localScale *= scale; body.transform.localPosition = -bounds.center * scale;
                foreach (var render in body.GetComponentsInChildren<Renderer>()) render.sharedMaterial = Material(ColorOf("#fff0d1"), .12f, .6f);
                var normals = new[] { Vector3.up, Vector3.forward, Vector3.right, Vector3.left, Vector3.back, Vector3.down };
                var dot = Material(ColorOf("#25333b"), .05f, .4f);
                for (int face = 1; face <= 6; face++)
                {
                    var surface = new GameObject("Face " + face).transform; surface.SetParent(root, false);
                    surface.localRotation = Quaternion.FromToRotation(Vector3.up, normals[face - 1]);
                    int[] slots = face == 1 ? new[] { 4 } : face == 2 ? new[] { 0, 8 } : face == 3 ? new[] { 0, 4, 8 } : face == 4 ? new[] { 0, 2, 6, 8 } : face == 5 ? new[] { 0, 2, 4, 6, 8 } : new[] { 0, 2, 3, 5, 6, 8 };
                    foreach (int slot in slots)
                    {
                        var pip = GameObject.CreatePrimitive(PrimitiveType.Sphere); pip.transform.SetParent(surface, false);
                        pip.transform.localPosition = new Vector3((slot % 3 - 1) * .23f, .51f, (slot / 3 - 1) * .23f);
                        pip.transform.localScale = new Vector3(.13f, .025f, .13f); pip.GetComponent<Renderer>().sharedMaterial = dot;
                        Destroy(pip.GetComponent<Collider>());
                    }
                }
            }
        }

        IEnumerator TumbleDice(int[] values, float seconds)
        {
            MakeDice(); diceRoot.gameObject.SetActive(true); WholeBoard();
            var normals = new[] { Vector3.up, Vector3.forward, Vector3.right, Vector3.left, Vector3.back, Vector3.down };
            var ends = Enumerable.Range(0, 2).Select(i => Quaternion.Euler(0, i == 0 ? 18 : -22, 0) * Quaternion.FromToRotation(normals[Mathf.Clamp(values?[i] ?? 1, 1, 6) - 1], Vector3.up)).ToArray();
            for (float t = 0; t < 1; t += Time.unscaledDeltaTime / seconds)
            {
                for (int i = 0; i < 2; i++)
                {
                    float tumble = Mathf.Clamp01(t / .72f);
                    var spin = Quaternion.Euler(720 * tumble + i * 30, 520 * tumble, 640 * tumble);
                    dicePieces[i].rotation = t < .65f ? spin : Quaternion.Slerp(spin, ends[i], Smooth(Mathf.Clamp01((t - .65f) / .3f)));
                    dicePieces[i].position = new Vector3(i == 0 ? -.8f : .8f, 3.4f + Mathf.Abs(Mathf.Sin(t * Mathf.PI * 3)) * (1 - t) * 1.4f, -.2f + i * .35f);
                }
                yield return null;
            }
            for (int i = 0; i < 2; i++) dicePieces[i].rotation = ends[i];
            diceRoot.gameObject.SetActive(false);
        }

        [Preserve] public void ZoomIn() { cameraZoom = Mathf.Clamp(cameraZoom * 1.3f, 1, 3.5f); CameraTo(CameraTarget(), false); }
        [Preserve] public void ZoomOut() { cameraZoom = Mathf.Clamp(cameraZoom / 1.3f, 1, 3.5f); CameraTo(cameraZoom == 1 ? Vector3.zero : CameraTarget(), false); }
        Vector3 CameraTarget()
        {
            var ray = boardCamera.ViewportPointToRay(new Vector3(.5f, .5f));
            return new Plane(Vector3.up, Vector3.zero).Raycast(ray, out var distance) ? ray.GetPoint(distance) : Vector3.zero;
        }

        [Serializable] public class StreamedModel { public string id; public float[] positions, normals; public int[] indices; }
        [Preserve] public void RegisterModel(string json)
        {
            var data = JsonUtility.FromJson<StreamedModel>(json);
            if (data?.positions == null || tokens.Any(t => t.id == data.id)) return;
            int count = data.positions.Length / 3;
            var vertices = new Vector3[count]; var normals = new Vector3[count];
            for (int i = 0; i < count; i++)
            {
                vertices[i] = new Vector3(data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2]);
                normals[i] = new Vector3(data.normals[i * 3], data.normals[i * 3 + 1], data.normals[i * 3 + 2]);
            }
            var mesh = new Mesh { name = data.id, indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
            mesh.vertices = vertices; mesh.normals = normals; mesh.triangles = data.indices; mesh.RecalculateBounds(); mesh.UploadMeshData(true);
            var prefab = new GameObject(data.id, typeof(MeshFilter), typeof(MeshRenderer));
            prefab.GetComponent<MeshFilter>().sharedMesh = mesh; prefab.GetComponent<MeshRenderer>().sharedMaterial = cityMaterial;
            prefab.SetActive(false); streamedMeshes.Add(mesh); streamedModels.Add(prefab);
            tokens = tokens.Concat(new[] { new TokenAsset { id = data.id, label = data.id, prefab = prefab } }).ToArray();
            if (shown != null) foreach (var player in shown.players.Where(p => p.tokenId == data.id))
                if (pieces.TryGetValue(player.id, out var piece)) UpdateTokenModel(piece, player);
        }
        void LateUpdate()
        {
            PublishScreenLabels();
            if (!webMode || shown == null || webMotion != null) return;
            var mouse = Mouse.current;
            if (mouse != null && Mathf.Abs(mouse.scroll.ReadValue().y) > .1f)
            { if (mouse.scroll.ReadValue().y > 0) ZoomIn(); else ZoomOut(); }
            var touch = Touchscreen.current;
            if (touch != null && touch.touches.Count > 1 && touch.touches[0].press.isPressed && touch.touches[1].press.isPressed)
            {
                float distance = Vector2.Distance(touch.touches[0].position.ReadValue(), touch.touches[1].position.ReadValue());
                if (pinchDistance > 0 && Mathf.Abs(distance - pinchDistance) > 4)
                { cameraZoom = Mathf.Clamp(cameraZoom * distance / pinchDistance, 1, 3.5f); CameraTo(CameraTarget(), false); }
                pinchDistance = distance; dragging = true; return;
            }
            pinchDistance = 0;
            var pointer = Pointer.current;
            if (pointer == null) return;
            Vector2 point = pointer.position.ReadValue();
            if (pointer.press.wasPressedThisFrame) lastDrag = point;
            if (pointer.press.isPressed && dragging)
            {
                if (cameraMove != null) { StopCoroutine(cameraMove); cameraMove = null; }
                var plane = new Plane(Vector3.up, Vector3.zero);
                var previousRay = boardCamera.ScreenPointToRay(lastDrag); var currentRay = boardCamera.ScreenPointToRay(point);
                if (plane.Raycast(previousRay, out var previousDistance) && plane.Raycast(currentRay, out var currentDistance))
                    boardCamera.transform.position += previousRay.GetPoint(previousDistance) - currentRay.GetPoint(currentDistance);
            }
            lastDrag = point;
        }
    }
}
