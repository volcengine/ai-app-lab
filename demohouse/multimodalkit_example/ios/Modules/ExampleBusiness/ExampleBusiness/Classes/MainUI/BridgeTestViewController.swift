//
//  BridgeTestViewController.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/6/11.
//

import Foundation
import UIKit
import SnapKit
import WebKit
import MultiModalKitToB

class BridgeTestViewController: BaseViewController {
    
    private var webView: WKWebView?

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        setupUI()
        loadLocalHTML()
    }
    
    private func setupWebView() {
        if #available(iOS 14.0, *) {
            let bridge = AIBridge(context: .init(appletId: "test", containerId: "test"))
            let port = DefWebViewBridgePort.init(webviewDelegate: { [weak self] in self?.webView }, bridge: bridge)
            let contentController = WKUserContentController()
            let userScript = WKUserScript(source: DefWebViewBridgePort.bridgeScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true)
            contentController.addUserScript(userScript)
            contentController.addScriptMessageHandler(port, contentWorld: WKContentWorld.page, name: DefWebViewBridgePort.jsMessageHandlerObject())
            
            let webConfiguration = WKWebViewConfiguration()
            webConfiguration.userContentController = contentController
            webView = WKWebView(frame: .zero, configuration: webConfiguration)
            webView?.navigationDelegate = self
            webView?.translatesAutoresizingMaskIntoConstraints = false
        }
    }
    
    private func setupUI() {
        if let webView {
            view.addSubview(webView)
            
            webView.snp.makeConstraints { make in
                make.edges.equalToSuperview()
            }
        }
    }
    
    private func loadLocalHTML() {
        guard let htmlPath = BaseKit.bundle.path(forResource: "index", ofType: "html") else {
            Log.error("no html")
            return
        }
        var htmlUrl = URL(fileURLWithPath: htmlPath)
        
        if let testImgPath = BaseKit.bundle.path(forResource: "test_img", ofType: "jpg") {
            let img = UIImage(contentsOfFile: testImgPath)
            if let buffer = img?.getBuffer() {
                let info = AIMCameraImageInfo(buffer: buffer)
                if let imageId = AIMCameraImageManager.shared.storeImage(info) {
                    Log.info("add imgId \(imageId)")
                    
                    var urlComponents = URLComponents(url: htmlUrl, resolvingAgainstBaseURL: false)
                    var querys = urlComponents?.queryItems ?? []
                    querys.append(URLQueryItem(name: "image_id", value: imageId))
                    urlComponents?.queryItems = querys
                    htmlUrl = urlComponents?.url ?? htmlUrl
                }
            }
            
        }
        
        Log.info("load \(htmlUrl)")
        webView?.loadFileURL(htmlUrl, allowingReadAccessTo: htmlUrl.deletingLastPathComponent())
    }
}


extension BridgeTestViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        
    }
    
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        
    }
    
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        
    }
}
