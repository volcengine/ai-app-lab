//
//  RTChatSuggestionView.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation
import SnapKit
import SwifterSwift

class SuggestionFLowLayout: UICollectionViewFlowLayout {

    override func shouldInvalidateLayout(forBoundsChange newBounds: CGRect) -> Bool {
        return true
    }
        
}

class RTChatSuggestionView: UICollectionView {
    
    private(set) var onShow: Bool = false
    
    init() {
        let layout = UICollectionViewFlowLayout()
        layout.scrollDirection = .horizontal
        layout.minimumLineSpacing = 10
        layout.sectionInset = UIEdgeInsets(top: 10, left: 10, bottom: 0, right: 0)
        super.init(frame: .zero, collectionViewLayout: layout)
        register(cellWithClass: MDRealtimeChatSuggestionCell.self)
        showsHorizontalScrollIndicator = false
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
}

class MDRealtimeChatSuggestionCell: UICollectionViewCell {
    
    let label = UILabel()
    let bgView = UIView()
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupView()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    private func setupView() {
        bgView.backgroundColor = UIColor(hexString: "#f5f5f5")
        bgView.layer.cornerRadius = MessageCellUI.kSuggestionCellHeight / 2
        bgView.layer.masksToBounds = true
        contentView.addSubview(bgView)
        bgView.snp.makeConstraints { make in
            make.edges.equalToSuperview()
        }
        
        label.font = MessageCellUI.kFont
        label.textAlignment = .center
        label.textColor = .black
        bgView.addSubview(label)
        label.snp.makeConstraints { make in
            make.top.bottom.equalToSuperview()
            make.left.right.equalToSuperview().inset(5)
        }
    }
}
