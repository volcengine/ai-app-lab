import Foundation
import UIKit
import TTNetworkManager

public class StartUpManager {
    
    public static let shared = StartUpManager()
    
    private init() {}

    private var isInitialized: Bool = false
    
    public func initialize() {
        guard !isInitialized else { return }
        setupNetWork()
        MultiModalManager.shared.setup()
        isInitialized = true
        Log.info("ExampleBusiness StartUpManager initialized successfully")
    }
    
    public func applicationDidBecomeActive() {
        Log.info("Application did become active")
    }
    
    public func applicationDidEnterBackground() {
        Log.info("Application did enter background")
    }
    
    func setupNetWork() {
        TTNetworkManager.setMonitorBlock { json, type in
            Log.info(tag: "TTNet", "\(json)")
        }
        
        let tncConfig = """
        {
            \"data\":{
                \"chromium_open\": 1,
                \"ttnet_http_dns_enabled\": 0,
                \"ttnet_quic_enabled\": 1,
                \"ttnet_local_dns_time_out\":5,
                \"ttnet_h2_enabled\": 1,
                \"ttnet_socket_pool_param\": {
                    \"max_sockets_per_group\": 20
                },
                \"ttnet_preconnect_urls\": {},
                \"ttnet_buffer_config\": {
                    \"ttnet_request_body_buffer_size\": 1048576,
                },
            },
            \"message\":\"success\"
        }
        """
        TTNetworkManager.shareInstance().getDomainDefaultJSON = tncConfig
        TTNetworkManager.shareInstance().start()
    }
}
