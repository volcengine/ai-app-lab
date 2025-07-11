//
//  SpeechTestViewController.swift
//  ExampleBusiness
//
//  Created by ByteDance on 2025/5/15.
//

import Foundation
import UIKit
import SnapKit
import MultiModalKitToB

public class SpeechTestViewController: BaseViewController, AIMTTSSessionDelegate {
    
    // MARK: - UI Components
    private lazy var startASRButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("启动 ASR", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 8
        button.addTarget(self, action: #selector(startASRButtonTapped), for: .touchUpInside)
        return button
    }()
    
    private lazy var stopASRButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("停止 ASR", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 8
        button.addTarget(self, action: #selector(stopASRButtonTapped), for: .touchUpInside)
        return button
    }()
    
    private lazy var startTTSButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("启动 TTS", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 8
        button.addTarget(self, action: #selector(startTTSButtonTapped), for: .touchUpInside)
        return button
    }()
    
    private lazy var textView: UITextView = {
        let textView = UITextView()
        textView.isEditable = true
        textView.isScrollEnabled = true
        textView.font = .systemFont(ofSize: 14)
        textView.layer.borderWidth = 1
        textView.layer.borderColor = UIColor.lightGray.cgColor
        textView.layer.cornerRadius = 5
        return textView
    }()
    
    // MARK: - Lifecycle
    public override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }
    
    // MARK: - UI Setup
    private func setupUI() {
        view.backgroundColor = .white
        
        view.addSubview(startASRButton)
        view.addSubview(stopASRButton)
        view.addSubview(startTTSButton)
        view.addSubview(textView)
        
        startASRButton.snp.makeConstraints { make in
            make.top.equalTo(view.safeAreaLayoutGuide).offset(20)
            make.left.equalTo(view).offset(20)
            make.width.equalTo((view.bounds.width - 60) / 3)
            make.height.equalTo(44)
        }
        
        stopASRButton.snp.makeConstraints { make in
            make.top.equalTo(startASRButton)
            make.left.equalTo(startASRButton.snp.right).offset(10)
            make.width.equalTo(startASRButton)
            make.height.equalTo(startASRButton)
        }
        
        startTTSButton.snp.makeConstraints { make in
            make.top.equalTo(startASRButton)
            make.left.equalTo(stopASRButton.snp.right).offset(10)
            make.width.equalTo(startASRButton)
            make.height.equalTo(startASRButton)
        }
        
        textView.snp.makeConstraints { make in
            make.top.equalTo(startASRButton.snp.bottom).offset(20)
            make.left.equalTo(view).offset(20)
            make.right.equalTo(view).offset(-20)
            make.bottom.equalTo(view.safeAreaLayoutGuide).offset(-20)
        }
    }
    
    // MARK: - Button Actions
    @objc private func startASRButtonTapped() {
        AIMASRManager.shared.start { success, errorMsg in
            if !success {
                Log.error("start asr failed \(errorMsg ?? "unknown error")")
                MPUI.showToast("启动 ASR 失败 \(errorMsg ?? "未知错误")")
            }
        } event: { [weak self] msg, finished in
            self?.textView.text.append("\nASR 识别结果: \(msg)")
        } statusCallback: { [weak self] status, errorMsg in
            self?.textView.text.append("\nASR 状态更新: \(status), error: \(errorMsg)")
        }
    }
    
    @objc private func stopASRButtonTapped() {
        AIMASRManager.shared.stop()
    }
    
    @objc private func startTTSButtonTapped() {
        let txt = "今天天气很不错，欢迎大家使用多模态 SDK"
        self.textView.text.append("\nTTS 开始识别: \(txt)")
        AIMTTSManager.shared.createSession(config: nil, delegate: self, text: txt)
    }
    
    // MARK: - TTS delegate
    
    public func ttsSession(_ session: any MultiModalKitToB.AIMTTSSessionService, statusDidChanged status: MultiModalKitToB.AIMTTSSessionStatus, errorMsg: String?) {
        let msg = "\nTTS 状态更新: \(status), error: \(errorMsg)"
        self.textView.text.append(msg)
    }
    
    public func ttsSession(_ session: any MultiModalKitToB.AIMTTSSessionService, didReceiveAudioData: Data) {
        
    }
}
