//
//  RTStreamTextMessageModel.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation
import MultiModalKitToB

class RTStreamTextMessageModel: RTBaseMessageModel {
    
    override var type: MessageModelType { .streamText }
    
    var currentIndex = 0
    var currentContent: String { message.content }
    var isFinished: Bool { message.isFinished }
    var onContentEnd: Bool { currentContent.isEmpty || currentIndex + 1 == currentContent.count }
    
    override init(message: AIMRealtimeMessage) {
        super.init(message: message)
    }
    
    func updateMessage() {
        host.updateMessage(for: self)
        if !onContentEnd {
            host.refreshMessage(for: self)
            return
        }
        
        if isFinished { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
            self?.updateMessage()
        }
    }
    
    var showContent: NSAttributedString {
        var str = ""
        if isFinished {
            str = currentContent
        } else if !currentContent.isEmpty {
            str = String(currentContent.prefix(currentIndex + 1))
        }
        
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.minimumLineHeight = MessageCellUI.kLineHeight
        paragraphStyle.maximumLineHeight = MessageCellUI.kLineHeight
        let attrStr = NSMutableAttributedString(string: str, attributes: [
            .font: MessageCellUI.kFont,
            .paragraphStyle: paragraphStyle,
            .foregroundColor: message.isMy ? UIColor.white : UIColor.black
        ])
        return attrStr
    }
    
    func showContentSize(_ showContent: NSAttributedString) -> CGSize {
        let size = TextMessageCellLayoutManager.shared.calculatesLayoutInfo(for: showContent)
        return size
    }
    
    override func cellClass() -> RTBaseMessageCell.Type {
        return RTStreamTextMessageCell.self
    }
    
    override func cellHeight() -> CGFloat {
        return MessageCellUI.kTopSpacing + showContentSize(showContent).height
    }
    
}
