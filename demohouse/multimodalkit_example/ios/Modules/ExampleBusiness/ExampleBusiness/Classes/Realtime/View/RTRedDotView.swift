//
//  RTRedDotView.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation
import UIKit

class RTRedDotView: UIView {

    private var dotView: UIView?

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupDotView()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupDotView()
    }

    private func setupDotView() {
        let dotSize: CGFloat = 18
        dotView = UIView(frame: CGRect(x: 0, y: 0, width: dotSize, height: dotSize))
        dotView?.backgroundColor = .red
        dotView?.layer.cornerRadius = dotSize / 2
        dotView?.layer.borderColor = UIColor.white.cgColor
        addSubview(dotView!)
        dotView?.isHidden = true
    }

    func show() {
        dotView?.isHidden = false
    }

    func hide(after delay: TimeInterval) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            self.dotView?.isHidden = true
        }
    }
}
