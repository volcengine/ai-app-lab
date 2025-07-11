import UIKit

enum TestBusiness: String {
    case vlm = "VLM测试"
    case audio = "语音测试"
    case realtime = "实时通话"
    case bridge = "Bridge测试"
}

public class MainViewController: BaseViewController {
    
    private lazy var tableView: UITableView = {
        let table = UITableView(frame: .zero, style: .insetGrouped)
        table.delegate = self
        table.dataSource = self
        table.backgroundColor = .systemGroupedBackground
        table.register(UITableViewCell.self, forCellReuseIdentifier: "Cell")
        return table
    }()
    
    private let items: [TestBusiness] = [.vlm, .audio, .realtime, .bridge]
    
    public override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }
    
    private func setupUI() {
        view.backgroundColor = .systemGroupedBackground
        title = "多模态SDK Demo"
        
        view.addSubview(tableView)
        tableView.frame = view.bounds
        tableView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    }
}

// MARK: - UITableViewDataSource
extension MainViewController: UITableViewDataSource {
    public func numberOfSections(in tableView: UITableView) -> Int {
        return 1
    }
    
    public func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return items.count
    }
    
    public func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "Cell", for: indexPath)
        cell.textLabel?.text = items[safe: indexPath.row]?.rawValue
        cell.accessoryType = .disclosureIndicator
        return cell
    }
}

// MARK: - UITableViewDelegate

extension MainViewController: UITableViewDelegate {
    public func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        
        let title = items[indexPath.row]
        if title == .vlm {
            let vlmTestVC = VLMTestViewController()
            navigationController?.pushViewController(vlmTestVC, animated: true)
        }
        if title == .audio {
            let vc = SpeechTestViewController()
            navigationController?.pushViewController(vc, animated: true)
        }
        if title == .realtime {
            let vc = RealtimeViewController()
            navigationController?.pushViewController(vc, animated: true)
        }
        if title == .bridge {
            let vc = BridgeTestViewController()
            navigationController?.pushViewController(vc, animated: true)
        }
    }
}
