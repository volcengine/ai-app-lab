//
//  DispatchQueueExtension.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation
import SwifterSwift

public extension DispatchQueue {
    
    public func safeSync(_ block: () -> Void) {
        if DispatchQueue.isCurrent(self) {
            block()
        } else {
            self.sync {
                block()
            }
        }
    }
    
    public func safeAsync(_ block: @escaping () -> Void) {
        if DispatchQueue.isCurrent(self) {
            block()
        } else {
            self.async {
                block()
            }
        }
    }
    
}
