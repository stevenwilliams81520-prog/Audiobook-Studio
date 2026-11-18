import Foundation
import AVFoundation
import Capacitor

/// Renders text with Apple's built-in voices (AVSpeechSynthesizer) into raw audio,
/// so the app can mix it and save MP3 / M4B / WAV files.
/// JS:  AppleTTS.voices() -> { voices: [{ id, name, language, quality }] }
///      AppleTTS.synthesize({ text, voice, rate }) -> { sampleRate, pcm16 }  (base64, 16-bit little-endian mono)
@objc(AppleTTSPlugin)
public class AppleTTSPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleTTSPlugin"
    public let jsName = "AppleTTS"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "voices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "synthesize", returnType: CAPPluginReturnPromise)
    ]

    // Jobs run one at a time; the synthesizer must stay alive until a job finishes.
    private let queue = DispatchQueue(label: "AppleTTSPlugin.render")
    private let lock = NSLock()
    private var active: RenderJob?

    @objc func voices(_ call: CAPPluginCall) {
        let list: [[String: Any]] = AVSpeechSynthesisVoice.speechVoices().map { v in
            var quality = "default"
            if v.quality == .enhanced { quality = "enhanced" }
            if #available(iOS 16.0, *) { if v.quality == .premium { quality = "premium" } }
            return ["id": v.identifier, "name": v.name, "language": v.language, "quality": quality]
        }
        call.resolve(["voices": list])
    }

    @objc func synthesize(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            call.reject("No text to speak")
            return
        }
        let voiceId = call.getString("voice")
        let rate = Float(call.getDouble("rate") ?? 1.0)

        queue.async { [weak self] in
            guard let self = self else { return }
            let done = DispatchSemaphore(value: 0)
            DispatchQueue.main.async {
                let job = RenderJob(text: text, voiceId: voiceId, rate: rate) { result in
                    switch result {
                    case .success(let out): call.resolve(["sampleRate": out.sampleRate, "pcm16": out.pcm.base64EncodedString()])
                    case .failure(let err): call.reject(err.localizedDescription)
                    }
                    self.lock.lock(); self.active = nil; self.lock.unlock()
                    done.signal()
                }
                self.lock.lock(); self.active = job; self.lock.unlock()
                job.start()
            }
            _ = done.wait(timeout: .now() + 600)
        }
    }
}

private struct RenderOutput { let sampleRate: Double; let pcm: Data }

private enum RenderError: LocalizedError {
    case noAudio
    var errorDescription: String? { "Apple speech produced no audio. Try another voice." }
}

/// One text -> audio render. Finishes on the end-of-speech signal, the delegate callback,
/// or (as a safety net) when no audio has arrived for a short while.
private final class RenderJob: NSObject, AVSpeechSynthesizerDelegate {
    private let synth = AVSpeechSynthesizer()
    private let utterance: AVSpeechUtterance
    private let completion: (Result<RenderOutput, Error>) -> Void
    private let lock = NSLock()
    private var pcm = Data()
    private var sampleRate: Double = 22050
    private var finished = false
    private var idleTimer: DispatchWorkItem?

    init(text: String, voiceId: String?, rate: Float, completion: @escaping (Result<RenderOutput, Error>) -> Void) {
        self.completion = completion
        let u = AVSpeechUtterance(string: text)
        if let id = voiceId, let v = AVSpeechSynthesisVoice(identifier: id) {
            u.voice = v
        } else {
            u.voice = AVSpeechSynthesisVoice(language: "en-GB") ?? AVSpeechSynthesisVoice(language: "en-US")
        }
        let r = AVSpeechUtteranceDefaultSpeechRate * rate
        u.rate = max(AVSpeechUtteranceMinimumSpeechRate, min(AVSpeechUtteranceMaximumSpeechRate, r))
        self.utterance = u
        super.init()
        synth.delegate = self
    }

    func start() {
        armIdleTimer(seconds: 8)
        synth.write(utterance) { [weak self] buffer in
            guard let self = self, let pcmBuffer = buffer as? AVAudioPCMBuffer else { return }
            if pcmBuffer.frameLength == 0 { self.finish(); return }
            self.append(pcmBuffer)
            self.armIdleTimer(seconds: 1.5)
        }
    }

    private func append(_ b: AVAudioPCMBuffer) {
        let n = Int(b.frameLength)
        var samples = [Int16](repeating: 0, count: n)
        if let f = b.floatChannelData {
            let ch = f[0]
            for i in 0..<n {
                let v = max(-1.0, min(1.0, ch[i]))
                samples[i] = Int16(v * 32767.0)
            }
        } else if let s = b.int16ChannelData {
            let ch = s[0]
            for i in 0..<n { samples[i] = ch[i] }
        } else if let s = b.int32ChannelData {
            let ch = s[0]
            for i in 0..<n { samples[i] = Int16(truncatingIfNeeded: ch[i] >> 16) }
        } else {
            return
        }
        lock.lock()
        sampleRate = b.format.sampleRate
        samples.withUnsafeBufferPointer { pcm.append(Data(buffer: $0)) }
        lock.unlock()
    }

    private func armIdleTimer(seconds: Double) {
        lock.lock()
        idleTimer?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.finish() }
        idleTimer = item
        lock.unlock()
        DispatchQueue.global().asyncAfter(deadline: .now() + seconds, execute: item)
    }

    private func finish() {
        lock.lock()
        if finished { lock.unlock(); return }
        finished = true
        idleTimer?.cancel()
        let data = pcm, sr = sampleRate
        lock.unlock()
        DispatchQueue.main.async {
            if data.isEmpty { self.completion(.failure(RenderError.noAudio)) }
            else { self.completion(.success(RenderOutput(sampleRate: sr, pcm: data))) }
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        // Give any last buffers a moment to arrive, then finish
        armIdleTimer(seconds: 0.4)
    }
}
