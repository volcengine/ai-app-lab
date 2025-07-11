//
//  RTChatStopView.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation
import SnapKit

class RTChatStopView: UIView {
    
    private let label: UILabel = {
        let label = UILabel()
        label.text = "继续提问"
        label.textColor = UIColor.darkGray
        label.font = UIFont.systemFont(ofSize: 14)
        return label
    }()
    
    private let redSquare: UIView = {
        let view = UIView()
        view.backgroundColor = UIColor.red
        view.layer.cornerRadius = 5
        return view
    }()
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupView()
    }
    
    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupView()
    }
        
    private func setupView() {
        self.backgroundColor = UIColor.white
        self.layer.cornerRadius = 10
        self.layer.shadowColor = UIColor.lightGray.cgColor
        self.layer.shadowOpacity = 0.4
        self.layer.shadowOffset = CGSize(width: 0, height: 2)
        self.layer.shadowRadius = 4
        
        addSubview(label)
        addSubview(redSquare)
        
        label.snp.makeConstraints { make in
            make.centerY.equalToSuperview()
            make.leading.equalToSuperview().inset(16)
        }
        redSquare.snp.makeConstraints { make in
            make.width.height.equalTo(12)
            make.centerY.equalToSuperview()
            make.leading.equalTo(label.snp.trailing).offset(8)
            make.trailing.equalToSuperview().inset(16)
        }
    }
}
