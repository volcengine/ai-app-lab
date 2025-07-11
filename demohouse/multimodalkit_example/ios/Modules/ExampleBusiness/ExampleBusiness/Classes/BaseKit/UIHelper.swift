//
//  MPUI.swift
//  ExampleBusiness
//
//  Created by bytedance on 2025/5/28.
//

import Foundation
import SwifterSwift
import Toast_Swift

struct MPUI {
    static let kDeviceWidth = UIScreen.main.bounds.width
    static let kDeviceHeight = UIScreen.main.bounds.height
    static let kPreviewDefWidth = kDeviceWidth
    
    static let kCameraProcessAreaHeight = 172.0 + 30.0
    
    static let kPreviewDefHeight: Double = {
        if UIDevice.current.userInterfaceIdiom == .pad {
            return kPreviewDefWidth / 4.0 * 4.5
        } else {
            return kPreviewDefWidth / 3.0 * 4.0
        }
    }()
    
    static let kPreviewTop = kDeviceHeight - kCameraProcessAreaHeight - kPreviewDefHeight
    
    static func showToast(_ view: UIView, _ msg: String) {
        view.makeToast(msg, duration: 2, position: .center)
    }
    
    static func showToast(_ msg: String) {
        DispatchQueue.main.safeAsync {
            guard let view = Responder.topView else { return }
            showToast(view, msg)
        }
    }
}

extension UIColor {
    static func hex(_ hex: String) -> UIColor {
        return UIColor(hexString: hex) ?? .clear
    }
}

public extension UIWindow {
    static var keyWindow: UIWindow? {
        if #available(iOS 13, *) {
            let oldKeyWindow = UIApplication.shared.keyWindow

            let activeWindowScenes = UIApplication.shared
                .connectedScenes
                .filter { $0.activationState == .foregroundActive }
                .compactMap { $0 as? UIWindowScene }

            var result: UIWindow?
            if let scene = activeWindowScenes.first {
                result = keyWindow(from: scene)
            }
            
            if activeWindowScenes.count > 1 {
                if let scene = oldKeyWindow?.windowScene {
                    result = keyWindow(from: scene)
                }
            }

            if result == nil {
                result = UIApplication.shared.windows.first { $0.isKeyWindow }
            }

            if result == nil,
               let oldKeyWindows = oldKeyWindow,
               oldKeyWindows.isKeyWindow {
                result = oldKeyWindows
            }

            if result == nil,
               let delegate = UIApplication.shared.delegate,
               delegate.responds(to: #selector(getter: UIApplicationDelegate.window)) {
                result = UIApplication.shared.delegate?.window ?? nil
            }
            return result
        } else {
            return UIApplication.shared.keyWindow
        }
    }

    @available(iOS 13, *)
    private static func keyWindow(from windowScene: UIWindowScene) -> UIWindow? {
        windowScene.windows.first { $0.isKeyWindow }
    }

}

public enum Responder {

    static var topViewController: UIViewController? {
        guard let rootVC = UIWindow.keyWindow?.rootViewController else { return nil }
        return topViewController(for: rootVC)
    }
    
    public static var topView: UIView? { topViewController?.view }
    
    public static func topNavigationController(for responder: UIResponder) -> UINavigationController? {
        guard let topViewController = topViewController(for: responder) else { return nil }
        return (topViewController as? UINavigationController) ?? topViewController.navigationController
    }
    
    public static func topViewController(for viewController: UIViewController) -> UIViewController? {
        if let navVC = viewController as? UINavigationController,
           let lastVC = navVC.viewControllers.last {
            return topViewController(for: lastVC)
        } else if let barVC = viewController as? UITabBarController,
                  let selectedVC = barVC.selectedViewController {
            return topViewController(for: selectedVC)
        } else if let presentedVC = viewController.presentedViewController {
            return topViewController(for: presentedVC)
        } else {
            return viewController
        }
    }
    
    public static func topViewController(for view: UIView) -> UIViewController? {
        var responder: UIResponder? = view
        while responder != nil, !(responder is UIViewController) {
            responder = responder?.next
        }
        guard let vc: UIViewController = (responder as? UIViewController) ?? UIWindow.keyWindow?.rootViewController else { return nil }
        return topViewController(for: vc)
    }
    
    public static func topViewController(for responder: UIResponder) -> UIViewController? {
        switch responder {
        case let controller as UIViewController: return topViewController(for: controller)
        case let view as UIView: return topViewController(for: view)
        default: return topViewController
        }
    }
}
