# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

-verbose #打出混淆log
-optimizationpasses 1 #混淆压缩比

-dontskipnonpubliclibraryclasses #混淆第三方库
-dontskipnonpubliclibraryclassmembers

#把混淆类中的方法名也混淆了，keep类中一些不需要keep的类的方法名也混淆了,需要
-useuniqueclassmembernames

#代码混淆采用的算法，一般不改变，用谷歌推荐算即可
-optimizations !field/*,!class/merging/*,!method/removal/parameter,!method/propagation/*,!library/gson,!code/simplification/*,!method/marking/*,!code/removal/exception
#-dontoptimize

#-------------------关闭错误警告
-dontwarn javax.**
-dontwarn java.awt.**
-dontwarn com.sun.jdmk.comm.**
-dontwarn javax.annotation.**
-dontwarn android.app.**
-dontwarn android.view.**
-dontwarn android.widget.**
-dontwarn com.google.common.primitives.**
-dontwarn **CompatHoneycomb
-dontwarn **CompatHoneycombMR2
-dontwarn **CompatCreatorHoneycombMR2
-dontwarn org.apache.**
-dontnote android.support.**
-dontwarn android.support.**.R
-dontwarn android.support.**.R$*
#-------------------end 关闭错误警告

# For Gson
-keep,allowobfuscation class com.google.gson.annotations.*
-dontnote com.google.gson.annotations.Expose
-keepclassmembers class * {
    @com.google.gson.annotations.Expose <fields>;
}
-dontnote com.google.gson.annotations.SerializedName
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keep class com.google.gson.examples.android.model.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer
-keep class * implements java.io.Serializable
-keep class com.google.gson.** {*;}
# end gson

# for okhttp
-keep class okhttp3.internal.publicsuffix.PublicSuffixDatabase
# end okhttp

-keep class org.chromium.CronetClient* {*;}
# This class should be explicitly kept to avoid failure if
# class/merging/horizontal proguard optimization is enabled.

# Suppress unnecessary warnings.
-dontnote org.chromium.net.ProxyChangeListener$ProxyReceiver
-dontnote org.chromium.net.AndroidKeyStore
# Needs 'void setTextAppearance(int)' (API level 23).
-dontwarn org.chromium.base.ApiCompatibilityUtils
# Needs 'boolean onSearchRequested(android.view.SearchEvent)' (API level 23).
-dontwarn org.chromium.base.WindowCallbackWrapper

# Generated for chrome apk and not included into cronet.
-dontwarn org.chromium.base.BuildConfig
-dontwarn org.chromium.base.library_loader.NativeLibraries
-dontwarn org.chromium.base.multidex.ChromiumMultiDexInstaller

# Objects of this type are passed around by native code, but the class
# is never used directly by native code. Since the class is not loaded, it does
# not need to be preserved as an entry point.
-dontnote org.chromium.net.UrlRequest$ResponseHeadersMap
# https://android.googlesource.com/platform/sdk/+/marshmallow-mr1-release/files/proguard-android.txt#54
-dontwarn android.support.**

-keep class org.chromium.base.** {
    public <fields>;
    public <methods>;
    public *;
}

# Copyright 2016 The Chromium Authors. All rights reserved.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

# Contains flags that can be safely shared with Cronet, and thus would be
# appropriate for third-party apps to include.

# Keep all annotation related attributes that can affect runtime
-keepattributes RuntimeVisible*Annotations
-keepattributes AnnotationDefault


-dontwarn com.appsflyer.AFKeystoreWrapper

-keepclasseswithmembers,includedescriptorclasses class * {
  native <methods>;
}

# Keep all CREATOR fields within Parcelable that are kept.
-keepclassmembers class org.chromium.** implements android.os.Parcelable {
  public static *** CREATOR;
}

# Don't obfuscate Parcelables as they might be marshalled outside Chrome.
# If we annotated all Parcelables that get put into Bundles other than
# for saveInstanceState (e.g. PendingIntents), then we could actually keep the
# names of just those ones. For now, we'll just keep them all.
-keepnames class org.chromium.** implements android.os.Parcelable

# Keep all enum values and valueOf methods. See
# http://proguard.sourceforge.net/index.html#manual/examples.html
# for the reason for this. Also, see http://crbug.com/248037.
-keepclassmembers enum org.chromium.** {
    public static **[] values();
}

#包明不混合大小写
-dontusemixedcaseclassnames

#不去忽略非公共的库类
-dontskipnonpubliclibraryclasses
-dontskipnonpubliclibraryclassmembers

#预校验
-dontpreverify

# 保留sdk系统自带的一些内容 【例如：-keepattributes *Annotation* 会保留Activity的被@override注释的onCreate、onDestroy方法等】
-keepattributes Exceptions,InnerClasses,Signature,Deprecated,SourceFile,LineNumberTable,*Annotation*,EnclosingMethod

# 避免混淆泛型
-keepattributes Signature
# 抛出异常时保留代码行号,保持源文件以及行号
-keepattributes SourceFile,LineNumberTable

#重命名SourceFile，避免反编译工具推测出类名，优化包体积
-renamesourcefileattribute SourceFile

#-----------------------------6.默认保留区-----------------------
# 保持 native 方法不被混淆
-keepclasseswithmembernames class * {
    native <methods>;
}

-keepclassmembers public class * extends android.view.View {
 public <init>(android.content.Context);
 public <init>(android.content.Context, android.util.AttributeSet);
 public <init>(android.content.Context, android.util.AttributeSet, int);
 public void set*(***);
}

#保持 Serializable 不被混淆
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    !private <fields>;
    !private <methods>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# 保持自定义控件类不被混淆
-keepclasseswithmembers class * {
    public <init>(android.content.Context,android.util.AttributeSet);
}
# 保持自定义控件类不被混淆
-keepclasseswithmembers class * {
    public <init>(android.content.Context,android.util.AttributeSet,int);
}
# 保持自定义控件类不被混淆
-keepclassmembers class * extends android.app.Activity {
    public void *(android.view.View);
}

# 保持枚举 enum 类不被混淆
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# 保持 Parcelable 不被混淆
-keep class * implements android.os.Parcelable {
  public static final android.os.Parcelable$Creator *;
}

# 不混淆R文件中的所有静态字段，我们都知道R文件是通过字段来记录每个资源的id的，字段名要是被混淆了，id也就找不着了。
-keepnames class **.R$*
-keepclassmembers class **.R$* {
    public static <fields>;
}

#如果引用了v4或者v7包
-dontwarn android.support.**
-dontwarn com.hpplay.**

# 保持哪些类不被混淆
-keep public class * extends android.app.Appliction
-keep public class * extends android.app.Activity
-keep public class * extends android.app.Fragment
-keep public class * extends android.app.Service
-keep public class * extends android.content.BroadcastReceiver
-keep public class * extends android.content.ContentProvider
-keep public class * extends android.preference.Preference

# ============忽略警告，否则打包可能会不成功=============
-ignorewarnings
## end OnerRTC

#------------------  下方是共性的排除项目         ----------------
# 方法名中含有“JNI”字符的，认定是Java Native Interface方法，自动排除
# 方法名中含有“JRI”字符的，认定是Java Reflection Interface方法，自动排除

-keepclasseswithmembers class * {
    ... *JNI*(...);
}

-keep class **JNI* {*;}

-keep class kotlin.** {
    <fields>;
    <methods>;
}


# If Companion objects are instantiated via Kotlin reflection and they extend/implement a class that Proguard
# would have removed or inlined we run into trouble as the inheritance is still in the Metadata annotation
# read by Kotlin reflection.
# FIXME Remove if Kotlin reflection is supported by Pro/Dexguard
-if class **$Companion extends **
-keep class <2>
-if class **$Companion implements **
-keep class <2>

# https://medium.com/@AthorNZ/kotlin-metadata-jackson-and-proguard-f64f51e5ed32
-keep class kotlin.Metadata { *; }

# https://stackoverflow.com/questions/33547643/how-to-use-kotlin-with-proguard
-dontwarn kotlin.**

# TTWebViewSDK
-dontwarn android.webkit.**
# 去除空检查
-assumenosideeffects class kotlin.jvm.internal.Intrinsics {
    public static void checkExpressionValueIsNotNull(...);
    public static void checkNotNullExpressionValue(...);
    public static void checkReturnedValueIsNotNull(...);
    public static void checkFieldIsNotNull(...);
    public static void checkParameterIsNotNull(...);
}

-keep class kotlin.jvm.internal.Intrinsics
# 去除空检查 end

# keep kotlinx
-keep class kotlinx.* { *; }



-keep class androidx.core.app.ActivityCompat$OnRequestPermissionsResultCallback {
	*;
}
-keep class kotlin.coroutines.jvm.internal.ContinuationImpl {
	*;
}
-keep class androidx.appcompat.widget.AppCompatImageView {
	*;
}
-keep class androidx.lifecycle.LifecycleOwner {
	*;
}
-keep class kotlinx.coroutines.MainCoroutineDispatcher {
	*;
}
-keep class kotlinx.coroutines.CoroutineStart {
	*;
}



-keep class kotlin.coroutines.CoroutineContext {
	*;
}
-keep class kotlin.annotation.AnnotationRetention {
	*;
}
-keep class androidx.fragment.app.FragmentActivity {
	*;
}
-keep class androidx.appcompat.app.ActionBarDrawerToggle$DelegateProvider {
	*;
}
-keep class kotlin.reflect.KAnnotatedElement {
	*;
}
-keep class kotlin.ResultKt {
	*;
}
-keep class androidx.fragment.app.Fragment {
	*;
}
-keep class androidx.core.app.ActivityCompat$RequestPermissionsRequestCodeValidator {
	*;
}
-keep class androidx.fragment.app.FragmentManager {
	*;
}
-keep class androidx.core.app.TaskStackBuilder$SupportParentable {
	*;
}
-keep class kotlin.annotation.Retention {
	*;
}
-keep class androidx.activity.OnBackPressedDispatcherOwner {
	*;
}
-keep class kotlin.reflect.KCallable {
	*;
}
-keep class kotlin.jvm.JvmStatic {
	*;
}
-keep class kotlin.TypeCastException {
	*;
}
-keep class kotlin.collections.CollectionsKt {
	*;
}
-keep class androidx.activity.ComponentActivity {
	*;
}
-keep class kotlin.collections.CollectionsKt__CollectionsJVMKt {
	*;
}
-keep class kotlin.jvm.internal.DefaultConstructorMarker {
	*;
}
-keep class kotlin.jvm.internal.FunctionBase {
	*;
}
-keep class kotlin.LazyKt {
	*;
}
-keep class kotlin.jvm.JvmClassMappingKt {
	*;
}
-keep class io.reactivex.disposables.Disposable {
	*;
}
-keep class androidx.lifecycle.OnLifecycleEvent {
	*;
}
-keep class kotlin.coroutines.jvm.internal.SuspendLambda {
	*;
}
-keep class androidx.lifecycle.ViewModel {
	*;
}
-keep class kotlin.jvm.internal.PropertyReference {
	*;
}
-keep class androidx.lifecycle.Lifecycle$Event {
	*;
}
-keep class kotlin.jvm.internal.CallableReference {
	*;
}
-keep class kotlin.coroutines.jvm.internal.BaseContinuationImpl {
	*;
}

-keep class kotlinx.coroutines.Dispatchers {
	*;
}
-keep class kotlin.coroutines.jvm.internal.CoroutineStackFrame {
	*;
}
-keep class androidx.lifecycle.LifecycleObserver {
	*;
}
-keep class kotlinx.coroutines.BuildersKt {
	*;
}
-keep class kotlin.coroutines.Continuation {
	*;
}
-keep class kotlin.jvm.internal.Reflection {
	*;
}
-keep class kotlin.reflect.KClass {
	*;
}
-keep class androidx.savedstate.SavedStateRegistryOwner {
	*;
}
-keep class kotlin.Unit {
	*;
}
-keep class kotlin.Lazy {
	*;
}
-keep class androidx.core.view.KeyEventDispatcher$Component {
	*;
}
-keep class kotlin.coroutines.intrinsics.IntrinsicsKt {
	*;
}
-keep class kotlin.jvm.internal.Intrinsics {
	*;
}
-keep class kotlin.reflect.KDeclarationContainer {
	*;
}
-keep class kotlinx.coroutines.Job {
	*;
}
-keep class androidx.lifecycle.Lifecycle {
	*;
}
-keep class androidx.lifecycle.ViewModelStoreOwner {
	*;
}
-keep class kotlin.coroutines.intrinsics.IntrinsicsKt__IntrinsicsKt {
	*;
}
-keep class kotlin.jvm.internal.Lambda {
	*;
}
-keep class kotlin.reflect.KProperty1 {
	*;
}
-keep class androidx.fragment.app.FragmentTransaction {
	*;
}
-keep class kotlin.LazyKt__LazyJVMKt {
	*;
}
-keep class kotlin.jvm.internal.PropertyReference1 {
	*;
}
-keep class kotlinx.coroutines.DelayKt {
	*;
}
-keep class kotlin.reflect.KProperty {
	*;
}
-keep class kotlinx.coroutines.GlobalScope {
	*;
}
-keep class kotlinx.coroutines.CoroutineScope {
	*;
}
-keep class androidx.lifecycle.HasDefaultViewModelProviderFactory {
	*;
}
-keep class androidx.appcompat.app.AppCompatCallback {
	*;
}
-keep class kotlin.jvm.functions.Function2 {
	*;
}
-keep class kotlin.coroutines.jvm.internal.DebugMetadata {
	*;
}
-keep class kotlin.jvm.functions.Function1 {
	*;
}
-keep class kotlin.jvm.functions.Function0 {
	*;
}
#保证所有的Native方法不被混淆
-keepclasseswithmembernames class * {
    native <methods>;
}

# Retrofit does reflection on method and parameter annotations.
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations

-keep class com.google.protobuf.** {*;}
-keep class google.protobuf.** {*;}
-keep class com.google.protobuf.util.** {*;}

-keep class com.google.android.material.** {*;}
-keep class androidx.** {*;}
-keep public class * extends androidx.**
-keep interface androidx.** {*;}
-dontwarn com.google.android.material.**
-dontnote com.google.android.material.**

# Guarded by a NoClassDefFoundError try/catch and only used when on the classpath.
-dontwarn kotlin.Unit

# Onnx runtime rules
-keep class ai.onnxruntime.** { *; }

-keep class okhttp3.Request{*;}

-dontwarn okhttp3.**
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }

-keep class com.google.mediapipe.** { *; }
-keep class com.google.common.** { *; }
-keep public interface com.google.mediapipe.framework.* {
  public *;
}

# This method is invoked by native code.
-keep public class com.google.mediapipe.framework.Packet {
  public static *** create(***);
  public long getNativeHandle();
  public void release();
}

# This method is invoked by native code.
-keep public class com.google.mediapipe.framework.PacketCreator {
  *** releaseWithSyncToken(...);
}

# This method is invoked by native code.
-keep public class com.google.mediapipe.framework.MediaPipeException {
  <init>(int, byte[]);
}

# Required to use PacketCreator#createProto
-keep class com.google.mediapipe.framework.ProtoUtil$SerializedMessage { *; }

-keepattributes *Annotation*
-keep class androidx.annotation.Keep { *; }

-keep class * implements com.bytedance.ai.multimodal.vlm.api.tools.AITool {*;}
-keepclassmembers class * implements com.bytedance.ai.multimodal.vlm.api.tools.AITool {
    @com.bytedance.ai.multimodal.vlm.api.tools.AIToolFunction <methods>;
}

# AIBridge
-keepnames class * implements com.bytedance.ai.bridge.core.AIBridgeMethod
-keep class * implements com.bytedance.ai.bridge.protocol.AbsAIBridgePort {*;}

# TODO delete
-keep class com.ss.android.agilelogger.ALog {*;}
