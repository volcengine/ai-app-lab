//
//  RTBaseMessageModel.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation
import MultiModalKitToB
import SwifterSwift

enum MessageModelType: Int {
    case base
    case text
    case streamText
}

class RTMessageFactory {
    static func model(for message: AIMRealtimeMessage, host: RTChatView) -> RTBaseMessageModel {
        let model = RTStreamTextMessageModel(message: message)
        model.host = host
        return model
    }
}

extension AIMRealtimeMessage {
    var isMy: Bool { type == .asrQuery || type == .textQuery }
}

class MessageCellUI {
    static let kScreenW = UIScreen.main.bounds.size.width
    static let kScreenH = UIScreen.main.bounds.size.height
    static let kTopSpacing = 10.0
    static let kMaxCellWidth = 380.0
    static let kBgColor = UIColor(red: 0xe8 / 255.0, green: 0xe8 / 255.0, blue: 0xe8 / 255.0, alpha: 1.0)
    static let kUserBgColor = UIColor.hex("#8695ea")
    static let kWhite = UIColor.hex("#FFFFFF")
    
    static let kFont = UIFont.systemFont(ofSize: 18)
    static let kLineHeight = 18.0
    static let kSuggestFont = UIFont.systemFont(ofSize: 14)
    
    static let kSuggestionCellHeight = 30.0
    static let kSuggestionViewHeight = 40.0
}

class RTBaseMessageModel: NSObject {
    var type: MessageModelType { .base }
    var message: AIMRealtimeMessage
    weak var host: RTChatView!
    
    init(message: AIMRealtimeMessage) {
        self.message = message
        super.init()
    }
    
    func cellClass() -> RTBaseMessageCell.Type {
        return RTBaseMessageCell.self
    }
    
    func cellHeight() -> CGFloat {
        return MessageCellUI.kTopSpacing
    }
}

class TextMessageCellLayoutManager {
    static let shared = TextMessageCellLayoutManager()
    let cell = RTTextMessageCell()
    
    private init() {
        let window = UIApplication.shared.windows.first
        window?.addSubview(cell)
        cell.alpha = 0
        window?.bringSubviewToFront(cell)
    }
    
    func calculatesCellHeight(for message: String) -> CGFloat {
        return calculatesLayoutInfo(for: message).height + MessageCellUI.kTopSpacing
    }
    
    func calculatesLayoutInfo(for message: String) -> CGSize {
        let p = NSMutableParagraphStyle()
        p.minimumLineHeight = MessageCellUI.kLineHeight
        p.maximumLineHeight = MessageCellUI.kLineHeight
        let a = NSMutableAttributedString(string: message, attributes: [
            .font: MessageCellUI.kFont,
            .paragraphStyle: p,
        ])
        return calculatesLayoutInfo(for: a)
    }
    
    func calculatesLayoutInfo(for message: NSAttributedString) -> CGSize {
        cell.textView.attributedText = message
        let textSize = cell.textView.sizeThatFits(CGSize(width: MessageCellUI.kScreenW - 60, height: 99_999_999.0))
        return textSize
    }
}
