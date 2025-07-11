import UIKit
import SnapKit
import MultiModalKitToB

public class VLMTestViewController: BaseViewController {
    
    // MARK: - UI Components
    private lazy var inputTextView: UITextView = {
        let textView = UITextView()
        textView.font = .systemFont(ofSize: 16)
        textView.textColor = .black
        textView.backgroundColor = .systemBackground
        textView.layer.cornerRadius = 8
        textView.layer.borderWidth = 1
        textView.layer.borderColor = UIColor.systemGray4.cgColor
        textView.textContainerInset = UIEdgeInsets(top: 12, left: 8, bottom: 12, right: 8)
        return textView
    }()
    
    private lazy var outputTextView: UITextView = {
        let textView = UITextView()
        textView.font = .systemFont(ofSize: 16)
        textView.textColor = .black
        textView.backgroundColor = .systemGray6
        textView.layer.cornerRadius = 8
        textView.isEditable = false
        textView.textContainerInset = UIEdgeInsets(top: 12, left: 8, bottom: 12, right: 8)
        return textView
    }()
    
    private lazy var inputLabel: UILabel = {
        let label = UILabel()
        label.text = "输入"
        label.font = .systemFont(ofSize: 16, weight: .medium)
        label.textColor = .black
        return label
    }()
    
    private lazy var outputLabel: UILabel = {
        let label = UILabel()
        label.text = "输出"
        label.font = .systemFont(ofSize: 16, weight: .medium)
        label.textColor = .black
        return label
    }()
    
    private lazy var nonStreamButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("非流式发送", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 8
        button.addTarget(self, action: #selector(nonStreamButtonTapped), for: .touchUpInside)
        return button
    }()
    
    private lazy var streamButton: UIButton = {
        let button = UIButton(type: .system)
        button.setTitle("流式发送", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 8
        button.addTarget(self, action: #selector(streamButtonTapped), for: .touchUpInside)
        return button
    }()
    
    // MARK: - Lifecycle
    public override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        setupConstraints()
    }
    
    // MARK: - UI Setup
    private func setupUI() {
        view.backgroundColor = .white
        title = "VLM测试"
        
        view.addSubview(inputLabel)
        view.addSubview(inputTextView)
        view.addSubview(outputLabel)
        view.addSubview(outputTextView)
        view.addSubview(nonStreamButton)
        view.addSubview(streamButton)
        
        // Function Call Section
        let functionCallTitleLabel = UILabel()
        functionCallTitleLabel.text = "function call测试"
        functionCallTitleLabel.font = .systemFont(ofSize: 16, weight: .medium)
        functionCallTitleLabel.textColor = .black
        view.addSubview(functionCallTitleLabel)
        
        let functionContainerView = UIView()
        view.addSubview(functionContainerView)
        
        let functionNameLabel = UILabel()
        functionNameLabel.text = "Function: showToast"
        functionNameLabel.font = .systemFont(ofSize: 16)
        functionNameLabel.textColor = .black
        functionContainerView.addSubview(functionNameLabel)
        
        let functionSwitch = UISwitch()
        functionSwitch.addTarget(self, action: #selector(functionSwitchChanged), for: .valueChanged)
        functionContainerView.addSubview(functionSwitch)
        
        functionCallTitleLabel.snp.makeConstraints { make in
            make.top.equalTo(streamButton.snp.bottom).offset(20)
            make.leading.equalToSuperview().offset(16)
        }
        
        functionContainerView.snp.makeConstraints { make in
            make.top.equalTo(functionCallTitleLabel.snp.bottom).offset(8)
            make.leading.trailing.equalToSuperview().inset(16)
            make.height.equalTo(44)
        }
        
        functionNameLabel.snp.makeConstraints { make in
            make.leading.equalToSuperview()
            make.centerY.equalToSuperview()
        }
        
        functionSwitch.snp.makeConstraints { make in
            make.trailing.equalToSuperview()
            make.centerY.equalToSuperview()
        }
        
        let tapGesture = UITapGestureRecognizer(target: self, action: #selector(dismissKeyboard))
        view.addGestureRecognizer(tapGesture)
    }
    
    private func setupConstraints() {
        inputLabel.snp.makeConstraints { make in
            make.top.equalTo(view.safeAreaLayoutGuide).offset(20)
            make.leading.equalToSuperview().offset(16)
        }
        
        inputTextView.snp.makeConstraints { make in
            make.top.equalTo(inputLabel.snp.bottom).offset(8)
            make.leading.equalToSuperview().offset(16)
            make.trailing.equalToSuperview().offset(-16)
            make.height.equalTo(80)
        }
        
        outputLabel.snp.makeConstraints { make in
            make.top.equalTo(inputTextView.snp.bottom).offset(20)
            make.leading.equalToSuperview().offset(16)
        }
        
        outputTextView.snp.makeConstraints { make in
            make.top.equalTo(outputLabel.snp.bottom).offset(8)
            make.leading.equalToSuperview().offset(16)
            make.trailing.equalToSuperview().offset(-16)
            make.height.equalTo(120)
        }
        
        nonStreamButton.snp.makeConstraints { make in
            make.top.equalTo(outputTextView.snp.bottom).offset(20)
            make.trailing.equalTo(view.snp.centerX).offset(-8)
            make.width.equalTo(120)
            make.height.equalTo(44)
        }
        
        streamButton.snp.makeConstraints { make in
            make.top.equalTo(outputTextView.snp.bottom).offset(20)
            make.leading.equalTo(view.snp.centerX).offset(8)
            make.width.equalTo(120)
            make.height.equalTo(44)
        }
    }
    
    // MARK: - Actions
    @objc private func dismissKeyboard() {
        view.endEditing(true)
    }
    
    private var curChat: VLMChat?
    
    @objc private func nonStreamButtonTapped() {
        if useTool {
            MPUI.showToast("function call 测试仅支持流式请求")
            return
        }
        guard curChat == nil else {
            MPUI.showToast(view, "正在请求中，无法重复请求")
            return
        }
        guard let text = inputTextView.text, !text.isEmpty else {
            MPUI.showToast(view, "请输入 query 内容")
            return
        }
        guard let config = getVLMConfig() else {
            MPUI.showToast("无有效 VLM token，请重启尝试")
            return
        }
        outputTextView.text = ""
        let chat = AIMVLMProvider.shared.createVolcVLM(config: config)
        let msg = VLMMessageObject(type: .text, text: text)
        let entryMsg = VLMEntryMessage(role: .user, messages: [msg])
        chat.send(prompt: nil, messages: [entryMsg]) { [weak self] response in
            guard let self else { return }
            self.curChat = nil
            guard case let .success(data) = response.result else {
                Log.error("vlm failed \(response.result)")
                MPUI.showToast(view, "vlm failed \(response.result)")
                return
            }
            if let json = data as? [String: Any],
               let choices = json["choices"] as? [[String: Any]],
               let message = choices.first?["message"] as? [String: Any],
               let content = message["content"] as? String {
                self.updateResponse(content)
                return
            } else {
                Log.error("vlm failed \(response.result)")
                MPUI.showToast(view, "vlm failed \(response.result)")
                return
            }
        }
        curChat = chat
    }
    
    @objc private func streamButtonTapped() {
        guard curChat == nil else {
            MPUI.showToast(view, "正在请求中，无法重复请求")
            return
        }
        guard let text = inputTextView.text, !text.isEmpty else {
            MPUI.showToast(view, "请输入 query 内容")
            return
        }
        guard let config = getVLMConfig() else {
            MPUI.showToast("无有效 VLM token，请重启尝试")
            return
        }
        outputTextView.text = ""
        
        let chat = AIMVLMProvider.shared.createVolcVLM(config: config)
        let msg = VLMMessageObject(type: .text, text: text)
        let entryMsg = VLMEntryMessage(role: .user, messages: [msg])
        chat.sendStream(prompt: nil, messages: [entryMsg]) { [weak self] response in
            guard let self else { return }
            if response.isFinsihed {
                self.curChat = nil
            }
            var chunks = [String]()
            if case let .success(d) = response.result,
               let data = d as? Data,
               let chunkStr = String(data: data, encoding: .utf8) {
                chunks = chunkStr.components(separatedBy: "\n\n").filter() { !$0.isEmpty }
                chunks = chunks.flatMap { $0.components(separatedBy: "\r\n\r\n") }.filter { !$0.isEmpty }
            }
            for chunk in chunks {
                guard chunk.hasPrefix("data:") else { continue }
                guard let json = chunk.dropFirst(5).trimmingCharacters(in: .whitespacesAndNewlines).toJsonObj() else { continue }
                guard let choices = json["choices"] as? [[String: Any]] else { continue }
                for choice in choices {
                    guard let delta = choice["delta"] as? [String: Any] else { continue }
                    guard let content = delta["content"] as? String else { continue }
                    self.updateResponse(content)
                }
            }
        }
        curChat = chat
    }
    
    private func updateResponse(_ text: String) {
        DispatchQueue.main.async { [weak self] in
            self?.outputTextView.text.append(text)
        }
    }
    
    @objc private func functionSwitchChanged(_ sender: UISwitch) {
        useTool = sender.isOn
        if useTool {
            inputTextView.text = "打印一个 toast 显示 hello world"
        } else {
            inputTextView.text = ""
        }
    }
    
    private var useTool = false
    
    private func getVLMConfig() -> AIMVLMModelConfig? {
        guard let config = MultiModalManager.shared.vlmGlobalConfig else {
            return nil
        }
        if useTool {
            let c = AIMVLMModelConfig(model: config.model, token: config.token, tools: [ToastTool()])
            return c
        } else {
            return config
        }
    }
    
}

extension String {
    func toJsonObj() -> [String: Any]? {
        guard let data = data(using: .utf8) else { return nil }
        return try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any]
    }
}

class ToastTool: AIMVLMTool {
    
    var description: AIMVLMToolDescription {
        let param = AIMVLMToolParameters(properties: ["toast": .string("The message to display in the toast.")], required: ["toast"])
        let des = AIMVLMToolDescription(name: "show_toast", description: "Displays a toast message on the screen.", parameters: param)
        return des
    }
    
    struct Param: Codable {
        let toast: String
    }
    
    typealias T = Param
    
    func call(params: Param) {
        DispatchQueue.main.async {
            MPUI.showToast(params.toast)
        }
    }
    
    func onParamsConvertFailed(params: String) {
        DispatchQueue.main.async {
            MPUI.showToast("Tool 调用失败 \(params)")
        }
    }
}
