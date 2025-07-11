import Foundation

public class Log {
    
    public enum Level: String {
        case info = "Info"
        case error = "Error"
    }
    
    public let section: String
    
    public init(_ section: String) {
        self.section = section
    }
    
    public func log(level: Level, tag: String?, log: String, file: String, function: String, line: Int) {
        var nTag = section
        if let tag, !tag.isEmpty {
            nTag += "-\(tag)"
        }
        NSLog("[\(level.rawValue)][\(nTag)] \(log)")
    }
    
    public func info(tag: String? = nil, _ log: String, file: String = #file, function: String = #function, line: Int = #line) {
        self.log(level: .info, tag: tag, log: log, file: file, function: function, line: line)
    }
    
    public func error(tag: String? = nil, _ log: String, file: String = #file, function: String = #function, line: Int = #line) {
        self.log(level: .error, tag: tag, log: log, file: file, function: function, line: line)
    }
}

// MARK: - Default

extension Log {
    
    public static let def = Log("Def")
    
    public static func info(tag: String? = nil, _ log: String, file: String = #file, function: String = #function, line: Int = #line) {
        Log.def.log(level: .info, tag: tag, log: log, file: file, function: function, line: line)
    }
    
    public static func error(tag: String? = nil, _ log: String, file: String = #file, function: String = #function, line: Int = #line) {
        Log.def.log(level: .error, tag: tag, log: log, file: file, function: function, line: line)
    }
}
