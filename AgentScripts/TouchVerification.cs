using System;
using System.IO;
using System.Threading.Tasks;
using TableTalk;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.LowLevel;
using TouchPhase = UnityEngine.InputSystem.TouchPhase;

public static class TouchVerification
{
    public static async Task<object> Run()
    {
        if (!Application.isPlaying) throw new Exception("Run the TableTalk scene first.");
        var controller = UnityEngine.Object.FindAnyObjectByType<TableTalkPresentation>();
        controller.ResetSnapshot(File.ReadAllText("Assets/TableTalk/Art/PreviewSnapshot.json"));
        await Task.Delay(850);
        int firstFrame = Time.frameCount;
        var background = InputSystem.settings.backgroundBehavior;
        var editorInput = InputSystem.settings.editorInputBehaviorInPlayMode;
        InputSystem.settings.backgroundBehavior = InputSettings.BackgroundBehavior.IgnoreFocus;
        InputSystem.settings.editorInputBehaviorInPlayMode = InputSettings.EditorInputBehaviorInPlayMode.AllDeviceInputAlwaysGoesToGameView;
        var screen = InputSystem.AddDevice<Touchscreen>("Verification touchscreen");
        try
        {
            var center = new Vector2(Screen.width * .5f, Screen.height * .5f);
            float radius = Screen.width * .1f;
            float beforePinch = controller.boardCamera.transform.position.y;
            Touch(screen, 1, center - Vector2.right * radius, TouchPhase.Began);
            Touch(screen, 2, center + Vector2.right * radius, TouchPhase.Began);
            await Task.Delay(160);
            Touch(screen, 1, center - Vector2.right * radius * 2, TouchPhase.Moved);
            Touch(screen, 2, center + Vector2.right * radius * 2, TouchPhase.Moved);
            await Task.Delay(850);
            float afterPinch = controller.boardCamera.transform.position.y;
            Touch(screen, 1, center - Vector2.right * radius * 2, TouchPhase.Ended);
            Touch(screen, 2, center + Vector2.right * radius * 2, TouchPhase.Ended);
            await Task.Delay(160);
            if (afterPinch > beforePinch * .75f) throw new Exception("Pinch did not zoom the camera: height " + beforePinch + " -> " + afterPinch + "; current=" + Touchscreen.current?.name + "; frames=" + (Time.frameCount - firstFrame) + "; touches=" + screen.touches[0].phase.ReadValue() + "," + screen.touches[1].phase.ReadValue());

            var beforePan = controller.boardCamera.transform.position;
            Touch(screen, 3, center, TouchPhase.Began);
            await Task.Delay(100);
            for (int step = 1; step <= 8; step++)
            {
                Touch(screen, 3, center + Vector2.right * step * 12, TouchPhase.Moved);
                await Task.Delay(50);
            }
            Touch(screen, 3, center + Vector2.right * 96, TouchPhase.Ended);
            await Task.Delay(100);
            float pan = Vector3.Distance(beforePan, controller.boardCamera.transform.position);
            if (pan < .1f) throw new Exception("One-finger drag did not pan the camera.");
            if (Time.frameCount - firstFrame < 10) throw new Exception("Frames did not advance during touch input.");
            return new { pinchBefore = beforePinch, pinchAfter = afterPinch, panDistance = pan, frames = Time.frameCount - firstFrame };
        }
        finally
        {
            InputSystem.RemoveDevice(screen);
            InputSystem.settings.backgroundBehavior = background;
            InputSystem.settings.editorInputBehaviorInPlayMode = editorInput;
            controller.WholeBoard();
        }
    }

    static void Touch(Touchscreen screen, int id, Vector2 position, TouchPhase phase)
    {
        // The production input loop receives the same low-level events as a touch device.
        InputSystem.QueueStateEvent(screen, new TouchState { touchId = id, position = position, phase = phase, pressure = phase == TouchPhase.Ended ? 0 : 1 });
    }
}
