//
//  RTStreamTextMessageCell.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation

class RTStreamTextMessageCell: RTBaseMessageCell {
    
    let textView: UITextView = {
        let v = UITextView()
        v.tintColor = UIColor(red: 0, green: 59.0 / 255.0, blue: 149.0 / 255.0, alpha: 1)
        v.isScrollEnabled = false
        v.clipsToBounds = false
        v.isEditable = false
        v.backgroundColor = .clear
        v.font = MessageCellUI.kFont
        v.textContainerInset = UIEdgeInsets(top: 14.5, left: 16, bottom: 13.5, right: 16)
        v.textContainer.lineFragmentPadding = 0
        return v
    }()
    
    let bgView: UIView = {
        let v = UIView()
        v.layer.cornerRadius = 6
        v.layer.masksToBounds = true
        return v
    }()
    
    var typingTimer: Timer?
    
    deinit {
        typingTimer?.invalidate()
        typingTimer = nil
    }
    
    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        contentView.addSubview(bgView)
        bgView.addSubview(textView)
        
        textView.snp.makeConstraints { make in
            make.top.left.width.height.equalToSuperview()
        }
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func refreshWithModel(model: RTBaseMessageModel) {
        typingTimer?.invalidate()
        guard let model = model as? RTStreamTextMessageModel else { return }
        super.refreshWithModel(model: model)
        
        textView.attributedText = model.showContent
        let size = model.showContentSize(textView.attributedText)
        
        if model.message.isMy {
            bgView.backgroundColor = MessageCellUI.kUserBgColor
            bgView.snp.remakeConstraints { make in
                make.width.equalTo(size.width)
                make.height.equalTo(size.height)
                make.bottom.equalToSuperview()
                make.left.equalToSuperview().inset(30)
            }
        } else {
            bgView.backgroundColor = MessageCellUI.kWhite
            bgView.snp.remakeConstraints { make in
                make.width.equalTo(size.width)
                make.height.equalTo(size.height)
                make.bottom.equalToSuperview()
                make.left.equalToSuperview().inset(30)
            }
        }
        
        
        if model.isFinished {
            return
        }
        
        if model.onContentEnd {
            if !model.isFinished {
                model.updateMessage()
            }
        } else {
            typingTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] timer in
                self?.onTyping()
            }
        }
    }
    
    private func onTyping() {
        guard let model = currentModel as? RTStreamTextMessageModel else { return }
        if model.onContentEnd {
            typingTimer?.invalidate()
            if !model.isFinished {
                model.updateMessage()
            }
        } else {
            let currentContent = model.showContent
            let currentSize = model.showContentSize(currentContent)
            model.currentIndex += 1
            let newContent = model.showContent
            let newSize = model.showContentSize(newContent)
            if newSize != currentSize {
                typingTimer?.invalidate()
                host.refreshMessage(for: model)
            } else {
                textView.attributedText = newContent
            }
        }
    }
    
}
