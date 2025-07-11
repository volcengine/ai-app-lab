//
//  RealtimeViewController.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation
import MultiModalKitToB

class RealtimeViewController: BaseViewController {
    let log = Log("Realtime")
    let capture = CameraCapture()
    
    // MARK: - Realtime
    
    private var realtimeSession: AIMRealtimeSessionProtocol?
    private var videoSource: AIMDefaultVideoSource?
    
    private func getConfig() -> (AIMRealtimeSessionConfig?, AIMDefaultVideoSource) {
        var customSp = "你是一个具备图片理解能力的智能助手，请结合图片中的内容，有感情的回答用户的问题"
        let audioConfig = AIMRealtimeAudioConfig(vadDuration: 1000, ttsSpeakerType: "zh_female_kailangjiejie_moon_bigtts")
        var config: AIMRealtimeSessionConfig?
        let videoSourceConfig = AIMDefaultVideoSourceConfig(
            frameInterval: 1.0,
            frameLength: 720,
            enableFpCompute: true,
            fpMinDistance: 0.25
        )
        let videoSource = AIMDefaultVideoSource(config: videoSourceConfig) { [weak self] in
            guard let self else { return }
            self.redDotView.show()
            self.redDotView.hide(after: 0.5)
        }
        let asrProcessor = AIMDefaultASRResultProcessor(prompt: customSp, businessId: UUID().uuidString, videoSource: videoSource)
        config = AIMRealtimeSessionLocalConfig(delegate: self, audioConfig: audioConfig, asrProcessor: asrProcessor)
        return (config, videoSource)
    }
    
    private func createRealtimeSessionAndStart() {
        let (config, videoSource) = getConfig()
        guard let config else {
            log.error("no valid config")
            return
        }
        self.videoSource = videoSource
        realtimeSession = AIMRealtimeManager.shared.createSession(config: config)
    }
    
    private func clearRealtimeSession() {
        realtimeSession?.close()
        realtimeSession = nil
    }
    
    // MARK: - Other
    
    override func viewDidLoad() {
        super.viewDidLoad()
        enablePopGesture = false
        showNavigationBar = false
        
        setupView()
        checkCameraPermissionAndSetup()
    }
    
    private func checkCameraPermissionAndSetup() {
        PermissionManager.shared.requestCamera { [weak self] status in
            guard let self else { return }
            self.permissionLabel.isHidden = (status == .authorized)
            if status == .authorized {
                setupCamera()
            }
        }
    }
    
    private func setupCamera() {
        guard capture.setup() else { return }
        capture.delegate = self
        if let previewLayer = capture.previewLayer {
            previewLayer.frame = CGRectMake(0, 0, MPUI.kPreviewDefWidth, MPUI.kPreviewDefHeight)
            previewLayer.videoGravity = .resizeAspectFill
            previewView.layer.insertSublayer(previewLayer, at: 0)
        }
        capture.start()
        createRealtimeSessionAndStart()
    }
    
    @objc private func onExitRealtimeBtnClicked() {
        clearRealtimeSession()
        capture.stop()
        navigationController?.popViewController(animated: true)
    }
    
    @objc private func requestCameraPermission() {
        PermissionManager.shared.requestCamera { [weak self] status in
            guard let self else { return }
            self.permissionLabel.isHidden = (status == .authorized)
            if status == .authorized {
                self.setupCamera()
            } else {
                PermissionManager.shared.askOpenAppSettings(title: "相机访问已禁止", message: "请前往设置页启用相机权限以继续使用相机功能")
            }
        }
    }
    
    @objc func onCameraSwitchBtnClicked() {
        capture.switchCamera()
    }
    
    private func resetPreviewFrame(width: CGFloat, height: CGFloat) {
        if height <= 0 && width <= 0 { return }
        var w = 0.0
        var h = 0.0
        if width > 0 {
            w = min(width, MPUI.kPreviewDefWidth)
            h = w / 3.0 * 4
        } else {
            h = min(height, MPUI.kPreviewDefHeight)
            w = h / 4.0 * 3
        }
        let scale = w / MPUI.kPreviewDefWidth
        let t1 = CGAffineTransform(translationX: 0, y: (h - MPUI.kPreviewDefHeight) / 2)
        let t2 = CGAffineTransform(scaleX: scale, y: scale)
        previewView.transform = t2.concatenating(t1)
    }
    
    // MARK: - UI
    
    let previewView = UIView()
    private let pageTitle = UILabel()
    private let exitRealtimeBtn = UIButton()
    private let realtimeChatView = RTChatView()
    private let realtimeStatusBarView = RTStatusBarView()
    private let permissionLabel = UILabel()
    private let redDotView = RTRedDotView()
    private let realtimeSwitchBtn = UIButton()
    
    private func setupView() {
        view.backgroundColor = .black
        
        pageTitle.font = UIFont.systemFont(ofSize: 20)
        pageTitle.text = "Realtime"
        pageTitle.textColor = UIColor(hexString: "#ffffff", transparency: 0.95)
        view.addSubview(pageTitle)
        pageTitle.snp.makeConstraints { make in
            make.left.equalToSuperview().inset(24)
            make.top.equalToSuperview().inset(62)
            make.height.equalTo(28)
        }
        
        exitRealtimeBtn.setImage(UIImage(systemName: "phone.down.fill")?.withTintColor(.white, renderingMode: .alwaysOriginal), for: .normal)
        exitRealtimeBtn.backgroundColor = .red
        exitRealtimeBtn.layer.cornerRadius = 20
        exitRealtimeBtn.layer.masksToBounds = true
        exitRealtimeBtn.addTarget(self, action: #selector(onExitRealtimeBtnClicked), for: .touchUpInside)
        view.addSubview(exitRealtimeBtn)
        exitRealtimeBtn.snp.makeConstraints { make in
            make.centerY.equalTo(pageTitle)
            make.right.equalToSuperview().inset(24)
            make.width.height.equalTo(40)
        }
        
        view.addSubview(previewView)
        previewView.frame = CGRectMake(0, MPUI.kPreviewTop, MPUI.kPreviewDefWidth, MPUI.kPreviewDefHeight)
        
        permissionLabel.text = "无相机权限，点击去申请"
        permissionLabel.font = UIFont.systemFont(ofSize: 16)
        permissionLabel.textColor = .white
        permissionLabel.textAlignment = .center
        view.addSubview(permissionLabel)
        permissionLabel.snp.makeConstraints { make in
            make.center.width.equalToSuperview()
            make.height.equalTo(pageTitle)
        }
        let permissionTap = UITapGestureRecognizer(target: self, action: #selector(requestCameraPermission))
        permissionLabel.isUserInteractionEnabled = true
        permissionLabel.addGestureRecognizer(permissionTap)
        
        view.addSubview(realtimeChatView)
        realtimeChatView.delegate = self
        
        view.addSubview(realtimeStatusBarView)
        realtimeStatusBarView.snp.makeConstraints { make in
            make.centerX.equalToSuperview()
            make.centerY.height.equalTo(pageTitle)
            make.right.equalTo(exitRealtimeBtn.snp.left).offset(-20)
        }
        realtimeStatusBarView.retryAction = { [weak self] in
            guard let self else { return }
            clearRealtimeSession()
            createRealtimeSessionAndStart()
        }
        
        previewView.addSubview(redDotView)
        redDotView.snp.makeConstraints { make in
            make.left.equalToSuperview().inset(20)
            make.top.equalToSuperview().inset(20)
            make.width.height.equalTo(25)
        }
        
        realtimeSwitchBtn.isHidden = true
        let switchImg = UIImage(named: "camera.rotate")
        realtimeSwitchBtn.setImage(switchImg, for: .normal)
        realtimeSwitchBtn.addTarget(self, action: #selector(onCameraSwitchBtnClicked), for: .touchUpInside)
        previewView.addSubview(realtimeSwitchBtn)
        realtimeSwitchBtn.snp.makeConstraints { make in
            make.right.equalToSuperview().inset(20)
            make.top.equalToSuperview().inset(20)
            make.width.height.equalTo(25)
        }
    }
}

// MARK: - CameraCaptureDelegate

extension RealtimeViewController: CameraCaptureDelegate {
    
    func videoCapture(_ capture: CameraCapture, didCaptureVideoFrame frame: CMSampleBuffer) {
        guard let buffer = CMSampleBufferGetImageBuffer(frame) else { return }
        let pts = CMSampleBufferGetPresentationTimeStamp(frame).seconds
        DispatchQueue.main.async { [weak self] in
            self?.videoSource?.appendFrame(buffer)
        }
    }
}

// MARK: - RealtimeChatViewDelegate

extension RealtimeViewController: RTChatViewDelegate {
    func realtimeChatShouldStopHandling() -> Bool {
        realtimeSession?.abortCurrentTask()
        return true
    }
    
    func realtimeChatHeightDidChange(_ height: CGFloat) {
        let h = MPUI.kDeviceHeight - MPUI.kPreviewTop - height
        resetPreviewFrame(width: 0, height: h)
    }
    
    func realtimeChatDidSelectSuggestion(_ suggestion: String) {
        realtimeSession?.sendTextQuery(suggestion)
    }
}

// MARK: - AIMRealtimeSessionDelegate

extension RealtimeViewController: AIMRealtimeSessionDelegate {
    func ttsDidReceiveAudioData(_ data: Data) {}
    
    func asrDidReceiveAudioData(_ data: Data) {}
    
    func stopTTS() {}
    
    func stopASR() {}
    
    
    func session(_ session: AIMRealtimeSessionProtocol, didChangeStatus status: AIMRealtimeSessionStatus) {
        realtimeStatusBarView.updateStatus(status)
        realtimeChatView.updateStatus(status)
    }
    
    func session(_ session: AIMRealtimeSessionProtocol, updateMessage message: AIMRealtimeMessage) {
        realtimeChatView.updateMessage(message)
    }
}
