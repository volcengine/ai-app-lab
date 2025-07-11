import UIKit

open class BaseNavigationController: UINavigationController {
    
    open override func viewDidLoad() {
        super.viewDidLoad()
        interactivePopGestureRecognizer?.delegate = self
        self.delegate = self
    }
}

// MARK: - UIGestureRecognizerDelegate

extension BaseNavigationController: UIGestureRecognizerDelegate {
    public func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        
        if gestureRecognizer == self.interactivePopGestureRecognizer {
            if viewControllers.count < 2 || visibleViewController == viewControllers.first {
                return false
            }
            
            if let vc = visibleViewController as? BaseViewController {
                return vc.enablePopGesture
            }
        }

        return true
    }
}

// MARK: - UINavigationControllerDelegate

extension BaseNavigationController: UINavigationControllerDelegate {
    public func navigationController(_ navigationController: UINavigationController, willShow viewController: UIViewController, animated: Bool) {
        if let vc = viewController as? BaseViewController {
            navigationController.setNavigationBarHidden(!vc.showNavigationBar, animated: true)
        }
    }
}
