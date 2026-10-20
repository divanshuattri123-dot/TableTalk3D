using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using TableTalk;
using UnityEngine;

public static class MotionVerification
{
    public static async Task<object> Run()
    {
        var controller = UnityEngine.Object.FindAnyObjectByType<TableTalkPresentation>();
        if (controller == null || !Application.isPlaying) throw new Exception("Start the TableTalk preview first.");
        var token = GameObject.Find("Player tokens/Asha token").transform;
        var buttons = controller.studioCanvas.GetComponentsInChildren<UnityEngine.UI.Button>();
        var motion = Array.Find(buttons, b => b.name == "Token\nmotion");
        var jail = Array.Find(buttons, b => b.name == "Jail\ntransfer");
        if (motion == null || jail == null || motion.onClick.GetPersistentEventCount() != 1 || jail.onClick.GetPersistentEventCount() != 1)
            throw new Exception("Preview controls are not wired.");
        int initialFrame = Time.frameCount;
        var travel = new HashSet<Vector3>(); var arrest = new HashSet<Vector3>();
        var watch = Stopwatch.StartNew(); motion.onClick.Invoke();
        do { travel.Add(token.position); await Task.Delay(60); } while (controller.IsPresenting && watch.ElapsedMilliseconds < 10000);
        if (controller.IsPresenting || controller.PresentedEventId != 1 || travel.Count < 3) throw new Exception("Token motion did not visibly advance and complete.");
        long moveMilliseconds = watch.ElapsedMilliseconds;
        watch.Restart(); jail.onClick.Invoke();
        do { arrest.Add(token.position); await Task.Delay(60); } while (controller.IsPresenting && watch.ElapsedMilliseconds < 10000);
        if (controller.IsPresenting || controller.PresentedEventId != 2 || arrest.Count < 3 || !controller.jailBars.activeSelf)
            throw new Exception("Direct jail transfer or cage outcome failed.");
        return new {
            tokenMotionSamples = travel.Count, tokenMotionMilliseconds = moveMilliseconds,
            jailMotionSamples = arrest.Count, jailMotionMilliseconds = watch.ElapsedMilliseconds,
            framesAdvanced = Time.frameCount - initialFrame,
            cageVisible = controller.jailBars.activeSelf,
            finalEventId = controller.PresentedEventId,
            controlBindingsVerified = 2
        };
    }
}
