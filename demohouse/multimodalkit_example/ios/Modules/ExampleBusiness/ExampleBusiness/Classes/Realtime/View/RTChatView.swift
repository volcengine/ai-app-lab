//
//  RTChatView.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation
import MultiModalKitToB

protocol RTChatViewDelegate: AnyObject {
    func realtimeChatShouldStopHandling() -> Bool
    func realtimeChatHeightDidChange(_ height: CGFloat)
    func realtimeChatDidSelectSuggestion(_ suggestion: String)
}

class RTChatView: UIView {
    
    weak var delegate: RTChatViewDelegate?
    
    private let safeBottomH = 34.0
    private let topPanBarH = 20.0
    private var totalHeight = 0.0
    
    private var curSuggestionH: CGFloat { MessageCellUI.kSuggestionViewHeight }
    
    private let maxHeight = MPUI.kDeviceHeight * 0.7
    private var minHeight = MPUI.kCameraProcessAreaHeight
    
    private var contentH: Double { totalHeight - safeBottomH - curSuggestionH - topPanBarH }
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        totalHeight = minHeight
        setupView()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    let topPanBar = UIView()
    let chatContentView = RTChatContentView()
    let suggestionView = RTChatSuggestionView()
    let stopView = RTChatStopView()
    
    private func setupView() {
        backgroundColor = .white
        let path = UIBezierPath(roundedRect: CGRectMake(0, 0, UIScreen.main.bounds.size.width, 1000), byRoundingCorners: [.topLeft, .topRight], cornerRadii: CGSizeMake(topPanBarH, topPanBarH))
        let mask = CAShapeLayer()
        mask.path = path.cgPath
        layer.mask = mask
        
        chatContentView.delegate = self
        chatContentView.dataSource = self
        addSubviews([suggestionView, chatContentView, stopView, topPanBar])
        
        topPanBar.snp.makeConstraints { make in
            make.top.width.left.equalToSuperview()
            make.height.equalTo(topPanBarH)
        }
        let pan = UIPanGestureRecognizer(target: self, action: #selector(handlePanGesture(_:)))
        topPanBar.addGestureRecognizer(pan)
        topPanBar.isUserInteractionEnabled = true
        
        let panView = UIView()
        panView.backgroundColor = UIColor.hex("#f0f0f0")
        panView.layer.cornerRadius = 2
        panView.layer.masksToBounds = true
        topPanBar.addSubview(panView)
        panView.snp.makeConstraints { make in
            make.bottom.centerX.equalToSuperview().inset(2)
            make.height.equalTo(4)
            make.width.equalToSuperview().dividedBy(9.0)
        }
        
        suggestionView.delegate = self
        suggestionView.dataSource = self
        suggestionView.snp.makeConstraints { make in
            make.bottom.equalToSuperview().inset(safeBottomH)
            make.left.width.equalToSuperview()
            make.height.equalTo(curSuggestionH)
        }
        
        stopView.snp.makeConstraints { make in
            make.centerX.equalToSuperview()
            make.top.equalTo(suggestionView).offset(10)
            make.height.equalTo(suggestionView)
            make.width.equalTo(110)
        }
        stopView.isHidden = true
        let tap = UITapGestureRecognizer(target: self, action: #selector(onStopViewClicked))
        stopView.addGestureRecognizer(tap)
        
        chatContentView.snp.makeConstraints { make in
            make.top.equalTo(topPanBar.snp.bottom)
            make.bottom.equalTo(suggestionView.snp.top)
            make.left.width.equalToSuperview()
        }
        resetFrame()
    }
    
    func resetMinHeight() {
        totalHeight = minHeight
        resetFrame()
    }
    
    private func resetFrame() {
        let h = totalHeight
        let y = UIScreen.main.bounds.size.height - h
        let w = UIScreen.main.bounds.size.width
        frame = CGRectMake(0, y, w, h)
        layoutIfNeeded()
        delegate?.realtimeChatHeightDidChange(totalHeight)
    }
    
    @objc private func handlePanGesture(_ gesture: UIPanGestureRecognizer) {
        let translation = gesture.translation(in: self)
        
        if gesture.state == .changed {
            let changeH = -translation.y
            totalHeight += changeH
            totalHeight = min(totalHeight, maxHeight)
            totalHeight = max(totalHeight, minHeight)
            resetFrame()
            gesture.setTranslation(.zero, in: self)
            return
        }
        
        if gesture.state == .ended {
            let tmp = (maxHeight - minHeight) / 2 + minHeight
            if totalHeight > tmp {
                totalHeight = maxHeight
            } else {
                totalHeight = minHeight
            }
            UIView.animate(withDuration: 0.25) { [weak self] in
                self?.resetFrame()
            }
        }
    }
    
    private func scrollToLast(animated: Bool = false) {
        if chatContentView.contentSize.height > chatContentView.frame.height {
            let row = chatContentView.numberOfRows(inSection: 0) - 1
            if row > 0 {
                chatContentView.scrollToRow(at: IndexPath(row: row, section: 0), at: .bottom, animated: animated)
            }
        }
    }
    
    func updateStatus(_ status: AIMRealtimeSessionStatus) {
        if status == .error {
            stopView.isHidden = true
            suggestionView.isHidden = true
            return
        }
        
        if status == .handling || status == .talking {
            stopView.isHidden = false
            suggestionView.isHidden = true
            return
        }
        
        stopView.isHidden = true
        suggestionView.isHidden = false
    }
    
    @objc private func onStopViewClicked() {
        if delegate?.realtimeChatShouldStopHandling() == true {
            stopView.isHidden = true
        }
    }
    
    var cellMessages: [String: AIMRealtimeMessage] = [:]
    var cellModels: [RTBaseMessageModel] = []
    
    func updateMessage(_ message: AIMRealtimeMessage) {
        if cellMessages[message.msgId] == nil {
            hideSuggestion()
            let model = RTMessageFactory.model(for: message, host: self)
            cellModels.append(model)
            chatContentView.reloadData() { [weak self] in
                guard let self else { return }
                self.scrollToLast()
                let cellHeight = TextMessageCellLayoutManager.shared.calculatesCellHeight(for: message.content)
                if message.isMy && self.contentH < cellHeight {
                    self.totalHeight = self.safeBottomH + self.curSuggestionH + cellHeight + self.topPanBarH
                    self.resetFrame()
                }
            }
        }
        cellMessages[message.msgId] = message
    }
    
    func updateMessage(for model: RTBaseMessageModel) {
        guard let message = cellMessages[model.message.msgId] else { return }
        model.message = message
    }
    
    func refreshMessage(for model: RTBaseMessageModel) {
        guard let index = cellModels.firstIndex(of: model) else { return }
        chatContentView.reloadData() { [weak self] in
            self?.scrollToLast()
        }
    }
    
    var curSuggestion: AIMRealtimeSuggestion?
    
    func updateSuggestion(_ suggestion: AIMRealtimeSuggestion) {
        guard cellModels.last?.message.msgId == suggestion.msgId else { return }
        curSuggestion = suggestion
        suggestionView.reloadData()
    }
    
    func hideSuggestion() {
        curSuggestion = nil
        suggestionView.reloadData()
    }
    
    func clearContent() {
        cellMessages.removeAll()
        cellModels.removeAll()
        chatContentView.reloadData()
        hideSuggestion()
    }
}

extension RTChatView: UITableViewDelegate, UITableViewDataSource {
    
    public func tableView(_ tableView: UITableView, heightForRowAt indexPath: IndexPath) -> CGFloat {
        guard let model = cellModels[safe: indexPath.row] else { return 0 }
        return model.cellHeight()
    }
    
    public func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        
    }

    public func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return cellModels.count
    }
    
    public func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        guard let model = cellModels[safe: indexPath.row] else { return RTBaseMessageCell() }
        let cellClass = model.cellClass()
        let cell = tableView.dequeueReusableCell(withClass: cellClass, for: indexPath)
        cell.refreshWithModel(model: model)
        return cell
    }
    
}

extension RTChatView: UICollectionViewDelegateFlowLayout, UICollectionViewDataSource {
    
    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        if let suggestion = curSuggestion?.suggestions[safe: indexPath.row] {
            hideSuggestion()
            delegate?.realtimeChatDidSelectSuggestion(suggestion)
        }
    }
    
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        return curSuggestion?.suggestions.count ?? 0
    }
    
    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        let cell = collectionView.dequeueReusableCell(withClass: MDRealtimeChatSuggestionCell.self, for: indexPath)
        cell.label.text = curSuggestion?.suggestions[safe: indexPath.row]
        return cell
    }
    
    func collectionView(_ collectionView: UICollectionView, layout collectionViewLayout: UICollectionViewLayout, sizeForItemAt indexPath: IndexPath) -> CGSize {
        guard let text = curSuggestion?.suggestions[safe: indexPath.row] else { return .zero }
        let font = MessageCellUI.kFont
        let textWidth = text.size(withAttributes: [.font: font]).width
        return CGSize(width: textWidth + 40, height: MessageCellUI.kSuggestionCellHeight)
    }
    
}

class RTChatContentView: UITableView {
    
    override init(frame: CGRect, style: UITableView.Style) {
        super.init(frame: frame, style: style)
        backgroundColor = .clear
        keyboardDismissMode = .onDrag
        separatorStyle = .none
        registerCell()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    private func registerCell() {
        register(cellWithClass: RTTextMessageCell.self)
        register(cellWithClass: RTStreamTextMessageCell.self)
    }
    
}

