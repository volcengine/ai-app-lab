//
//  RTStatusBarView.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation
import MultiModalKitToB

class RTStatusBarView: UIView {
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        setupView()
    }
    
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }
    
    private let fullTextView = UILabel()
    private let retryBtn = UIButton()
    
    var retryAction: (() -> Void)?
    
    private func setupView() {
        fullTextView.font = UIFont.systemFont(ofSize: 14)
        fullTextView.textColor = UIColor(hexString: "#ffffff", transparency: 0.95)
        fullTextView.textAlignment = .center
        addSubview(fullTextView)
        fullTextView.snp.makeConstraints { make in
            make.center.width.height.equalToSuperview()
        }
        
        retryBtn.isHidden = true
        let retryImg = UIImage(systemName: "arrow.clockwise")
        retryBtn.setImage(retryImg, for: .normal)
        retryBtn.tintColor = .white
        retryBtn.addTarget(self, action: #selector(retryBtnClicked), for: .touchUpInside)
        addSubview(retryBtn)
        retryBtn.snp.makeConstraints { make in
            make.top.right.equalToSuperview()
            make.width.height.equalTo(fullTextView.snp.height)
        }
    }
    
    func updateStatus(_ status: AIMRealtimeSessionStatus) {
        if status == .notStarted || status == .starting {
            fullTextView.isHidden = false
            retryBtn.isHidden = true
            fullTextView.text = "启动中"
            return
        }
        
        if status == .listening || status == .idle {
            fullTextView.isHidden = false
            retryBtn.isHidden = true
            fullTextView.text = "请说话"
            return
        }
        
        if status == .talking {
            fullTextView.isHidden = false
            retryBtn.isHidden = true
            fullTextView.text = "正在回复"
            return
        }
        
        if status == .handling {
            fullTextView.isHidden = false
            retryBtn.isHidden = true
            fullTextView.text = "正在思考"
            return
        }
        
        if status == .error {
            fullTextView.isHidden = false
            retryBtn.isHidden = false
            fullTextView.text = "出现错误"
            return
        }
    }
    
    @objc private func retryBtnClicked() {
        retryAction?()
    }
}
