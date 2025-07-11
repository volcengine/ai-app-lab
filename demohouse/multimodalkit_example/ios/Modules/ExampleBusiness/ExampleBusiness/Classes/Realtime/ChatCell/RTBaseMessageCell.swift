//
//  RTBaseMessageCell.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation

class RTBaseMessageCell: UITableViewCell {
    var currentModel: RTBaseMessageModel?
    weak var host: RTChatView!
    
    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        selectionStyle = .none
        
        contentView.backgroundColor = .clear
        backgroundColor = .clear
        backgroundView = nil
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    func refreshWithModel(model: RTBaseMessageModel) {
        currentModel = model
        host = model.host
    }
}
