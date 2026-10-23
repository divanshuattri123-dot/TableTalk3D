using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;

namespace TableTalk.Editor
{
    public static class PresentationChecks
    {
        public static string RunLabels()
        {
            if (!Application.isPlaying) throw new InvalidOperationException("Run checks in a disposable Play Mode preview.");
            var game = UnityEngine.Object.FindFirstObjectByType<TableTalkPresentation>();
            var flags = BindingFlags.Instance | BindingFlags.NonPublic;
            var state = (BoardSnapshot)typeof(TableTalkPresentation).GetField("shown", flags).GetValue(game);
            if (state.roomCode != "STUDIO") throw new InvalidOperationException("Only the disposable studio preview may be changed.");
            var json = JsonUtility.ToJson(state);
            var camera = game.boardCamera;
            var originalPosition = camera.transform.position; var originalRotation = camera.transform.rotation;
            float originalAspect = camera.aspect;
            int views = 0, checkedCorners = 0;
            try
            {
                foreach (int size in new[] { 40, 48, 56, 64 })
                {
                    var fixture = JsonUtility.FromJson<BoardSnapshot>(json); fixture.boardSize = size;
                    fixture.tiles = Enumerable.Range(0, size).Select(id => new TileSnapshot
                    {
                        id = id, name = "Printed property", kind = id % (size / 4) == 0 ? "go" : "property", color = "#ed6266", price = 60
                    }).ToArray();
                    game.ResetSnapshot(JsonUtility.ToJson(fixture)); game.StopAllCoroutines();
                    var labels = (Dictionary<int, TMPro.TextMeshPro>)typeof(TableTalkPresentation).GetField("tileLabels", flags).GetValue(game);
                    foreach (float aspect in new[] { 16f / 9, 667f / 375, 568f / 320 })
                    foreach (bool angled in new[] { false, true })
                    foreach (float zoom in new[] { 1f, 1.3f, 2.15f, 3.5f })
                    {
                        camera.aspect = aspect;
                        float distance = BoardLayout.Span(size) * 2.05f / zoom;
                        var target = new Vector3(.35f, 0, -.25f);
                        var position = target + new Vector3(0, distance, -distance * (angled ? .7f : .24f));
                        camera.transform.SetPositionAndRotation(position, Quaternion.LookRotation(target - position));
                        var packet = game.ProjectScreenLabels();
                        foreach (var anchor in packet.labels)
                        {
                            var rect = labels[anchor.id].rectTransform;
                            if (Mathf.Abs(anchor.localWidth - rect.rect.width) > .00001f || Mathf.Abs(anchor.localHeight - rect.rect.height) > .00001f)
                                throw new Exception("Zoom changed a label's intrinsic printing dimensions.");
                            if (anchor.corners.Length != 4) throw new Exception("Label projection lost a tile corner.");
                            for (int corner = 0; corner < 4; corner++)
                            {
                                var local = new Vector3(corner == 0 || corner == 3 ? rect.rect.xMin : rect.rect.xMax,
                                    corner < 2 ? rect.rect.yMax : rect.rect.yMin, 0);
                                var expected = camera.WorldToViewportPoint(rect.TransformPoint(local));
                                var actual = anchor.corners[corner];
                                if (Vector2.Distance(actual, new Vector2(expected.x, 1 - expected.y)) > .00001f)
                                    throw new Exception("A projected label corner moved away from its tile plane.");
                                checkedCorners++;
                            }
                        }
                        views++;
                    }
                }
            }
            finally
            {
                game.ResetSnapshot(json); game.StopAllCoroutines(); camera.aspect = originalAspect;
                camera.transform.SetPositionAndRotation(originalPosition, originalRotation);
            }
            return $"PASS: {views} camera states across four map sizes, four zooms, two angles and three desktop/mobile aspects; {checkedCorners} label corners remain on their exact tile planes.";
        }

        public static string Run()
        {
            if (!Application.isPlaying) throw new InvalidOperationException("Run checks in a disposable Play Mode preview.");
            var game = UnityEngine.Object.FindFirstObjectByType<TableTalkPresentation>();
            if (game == null) throw new InvalidOperationException("Open the TableTalk scene first.");
            var flags = BindingFlags.Instance | BindingFlags.NonPublic;
            var type = typeof(TableTalkPresentation);
            var state = (BoardSnapshot)type.GetField("shown",flags).GetValue(game);
            if (state.roomCode != "STUDIO") throw new InvalidOperationException("Only the disposable studio preview may be changed by this harness.");
            var json = JsonUtility.ToJson(state);
            var fixture = JsonUtility.FromJson<BoardSnapshot>(json);
            var deed = fixture.tiles.First(t => t.kind == "property");
            deed.ownerId = fixture.players[0].id; deed.houses = 2;
            game.SyncSnapshot(JsonUtility.ToJson(fixture));
            var propertyRoot = (Transform)type.GetField("propertyRoot",flags).GetValue(game);
            var before = propertyRoot.Cast<Transform>().Select(child=>child.GetEntityId()).ToArray();
            if (before.Length == 0) throw new Exception("The geometry-retention test needs a visibly owned, developed deed.");
            game.SyncSnapshot(JsonUtility.ToJson(fixture));
            var after = propertyRoot.Cast<Transform>().Select(child=>child.GetEntityId()).ToArray();
            if (!before.SequenceEqual(after)) throw new Exception("Unchanged snapshot recreated property geometry.");
            var tiles = (Dictionary<int,Transform>)type.GetField("tiles",flags).GetValue(game);
            var tile = tiles[1]; tile.position += Vector3.up*.2f; tile.rotation=Quaternion.Euler(0,0,65);
            propertyRoot.localScale=Vector3.one*1.025f;
            game.ResumeSnapshot(JsonUtility.ToJson(fixture));
            var expected = BoardLayout.Point(1,state.boardSize); expected.y=.07f;
            if (Vector3.Distance(tile.position,expected)>.0001f || Quaternion.Angle(tile.rotation,Quaternion.identity)>.001f || propertyRoot.localScale!=Vector3.one || game.WebMotionPlaying)
                throw new Exception("Resume left an interrupted tile or building transform behind.");
            float agreement=1, maxStep=0;
            for(int i=0;i<1200;i++)
            {
                float d=i*.01f;
                TableTalkPresentation.FarmRoute(d,out var p,out var forward);
                TableTalkPresentation.FarmRoute(d+.001f,out var next,out var nextForward);
                agreement=Mathf.Min(agreement,Vector3.Dot((next-p).normalized,forward));
                maxStep=Mathf.Max(maxStep,Vector3.Distance(p,next));
            }
            if (agreement<.999f || maxStep>.0011f) throw new Exception("Tractor route reverses or jumps at a turn.");
            var surface = game.city.GetComponentInChildren<Renderer>().sharedMaterial;
            if (surface.shader.name != "TableTalk/City Surface" || surface.GetTexture("_CityLighting") == null || RenderSettings.customReflectionTexture == null)
                throw new Exception("The saved city surface, contact lighting or reflection is missing.");
            foreach (int size in new[] { 40,48,56,64 }) foreach (bool angled in new[] {false,true})
            {
                float span = BoardLayout.Span(size), height = span*2.05f;
                float cameraZ = -height*(angled ? .7f : .24f);
                float farCorner = new Vector3(span*.5f,height,cameraZ-span*.5f).magnitude;
                if (BoardLayout.ShadowRange(size,angled,false) < farCorner)
                    throw new Exception("The enlarged board extends beyond its shadow range.");
            }
            game.SyncSnapshot(json);
            return $"PASS: {before.Length} nonempty property instance IDs unchanged; interrupted tile/scale reset; city material assets assigned; all map/camera shadow bounds covered; 1200 tractor route samples, tangent agreement {agreement:F6}, maximum step {maxStep:F6}; {game.LivingWorldActorCount} living actors.";
        }
    }
}
