//
//  ModelLoader.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/6/12.
//

import Foundation
import MultiModalKitToB

class ModelLoader: NSObject, AIMMLModelLoadService {
    func loadModel(info: AIMMLModelInfo, callback: @escaping (String?) -> Void) {
        let path = BaseKit.bundle.path(forResource: info.name, ofType: info.type.rawValue)
        callback(path)
    }
    
    static func makeService() -> AIMServiceProtocol {
        return ModelLoader()
    }
}
