//
//  RTTextMessageCell.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation

class RTTextMessageCell: RTBaseMessageCell {
    
    let textView: UITextView = {
        let v = UITextView()
        v.tintColor = UIColor(red: 0, green: 59.0 / 255.0, blue: 149.0 / 255.0, alpha: 1)
        v.isScrollEnabled = false
        v.clipsToBounds = false
        v.isEditable = false
        v.backgroundColor = .clear
        v.textColor = .white
        v.font = MessageCellUI.kFont
        v.textContainerInset = UIEdgeInsets(top: 14.5, left: 16, bottom: 13.5, right: 16)
        v.textContainer.lineFragmentPadding = 0
        return v
    }()
    
    let bgView: UIView = {
        let v = UIView()
        v.layer.cornerRadius = 12
        v.layer.masksToBounds = true
        return v
    }()
    
    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        contentView.addSubview(bgView)
        bgView.addSubview(textView)
        textView.snp.makeConstraints { make in
            make.top.left.width.right.equalToSuperview()
        }
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    override func refreshWithModel(model: RTBaseMessageModel) {
        guard let model = model as? RTTextMessageModel else { return }
        super.refreshWithModel(model: model)
        textView.attributedText = model.attrStr
        
        
        if model.message.isMy {
            bgView.backgroundColor = MessageCellUI.kBgColor
            bgView.snp.remakeConstraints { make in
                make.width.equalTo(model.textSize.width)
                make.height.equalTo(model.textSize.height)
                make.bottom.equalToSuperview()
                make.right.equalToSuperview().inset(30)
            }
        } else {
            bgView.backgroundColor = MessageCellUI.kWhite
            bgView.snp.remakeConstraints { make in
                make.width.equalTo(model.textSize.width)
                make.height.equalTo(model.textSize.height)
                make.bottom.equalToSuperview()
                make.left.equalToSuperview().inset(30)
            }
        }
    }
}
