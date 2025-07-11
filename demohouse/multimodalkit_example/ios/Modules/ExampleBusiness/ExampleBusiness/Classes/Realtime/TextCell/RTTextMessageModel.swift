//
//  RTTextMessageModel.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation

class RTTextMessageModel: RTBaseMessageModel {
    
    override var type: MessageModelType { .text }
    
    lazy var attrStr: NSAttributedString = {
        let str = message.content
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.minimumLineHeight = MessageCellUI.kLineHeight
        paragraphStyle.maximumLineHeight = MessageCellUI.kLineHeight
        let attrStr = NSMutableAttributedString(string: str, attributes: [
            .font: MessageCellUI.kFont,
            .paragraphStyle: paragraphStyle,
        ])
        return attrStr
    }()
    
    lazy var textSize: CGSize = {
        let size = TextMessageCellLayoutManager.shared.calculatesLayoutInfo(for: attrStr)
        return size
    }()
    
    override func cellClass() -> RTBaseMessageCell.Type {
        return RTTextMessageCell.self
    }
    
    override func cellHeight() -> CGFloat {
        return MessageCellUI.kTopSpacing + textSize.height
    }
    
}
