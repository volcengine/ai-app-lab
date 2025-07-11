Pod::Spec.new do |s|
  s.name             = 'ExampleBusiness'
  s.version          = '0.1.0'
  s.summary          = '示例业务模块'

  s.description      = <<-DESC
  这是一个示例业务模块，用于MultiModalKitExample项目
                       DESC

  s.homepage         = 'https://github.com/yourcompany/ExampleBusiness'
  s.license          = { :type => 'MIT', :file => 'LICENSE' }
  s.author           = { 'Your Name' => 'your-email@example.com' }
  s.source           = { :git => 'https://github.com/yourcompany/ExampleBusiness.git', :tag => s.version.to_s }

  s.ios.deployment_target = '13.0'
  s.swift_version = '5.0'

  s.default_subspecs = ['Core', 'Resources']

  s.subspec 'Core' do |ss|
    ss.source_files = 'ExampleBusiness/Classes/**/*'
  
    ss.dependency 'SnapKit'
    ss.dependency 'SwifterSwift'
    ss.dependency 'MultiModalKitToB'
    ss.dependency 'TTNetworkManager'
    ss.dependency 'SpeechEngineToB'
    ss.dependency 'Toast-Swift'
  end
  
  s.subspec 'Resources' do |sss|
    sss.resource_bundles = {
      'ExampleResource' => [
        'ExampleBusiness/Assets/*'
      ]
    }
  end
end
