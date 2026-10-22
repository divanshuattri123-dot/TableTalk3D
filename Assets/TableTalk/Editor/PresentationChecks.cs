using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;

namespace TableTalk.Editor
{
    public static class PresentationChecks
    {
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
