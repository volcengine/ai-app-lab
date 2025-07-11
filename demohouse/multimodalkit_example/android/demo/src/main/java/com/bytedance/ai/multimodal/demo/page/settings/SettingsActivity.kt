package com.bytedance.ai.multimodal.demo.page.settings

import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import com.bytedance.ai.multimodal.demo.R
import com.bytedance.ai.multimodal.demo.databinding.ActivitySettingsBinding
import com.bytedance.ai.multimodal.demo.page.hybrid.web.MultimodalWebActivity
import com.bytedance.ai.multimodal.demo.page.viewmodel.SettingsViewModel

class SettingsActivity : AppCompatActivity() {

    private val viewModel: SettingsViewModel by viewModels()

    private lateinit var binding: ActivitySettingsBinding

    private val selectImageLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri?.let {
            viewModel.updateSelectedImage(it)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)
        initData()
        setupView()
    }

    private fun initData() {
        val bitmap = BitmapFactory.decodeResource(resources, R.drawable.test)
        viewModel.fetchQueryMap(bitmap)
    }

    private fun setupView() {
        binding.apply {
            urlEditText.setText(viewModel.getMultimodalWebUrl(this@SettingsActivity))
            saveButton.setOnClickListener {
                viewModel.saveMultiModalUrl(
                    this@SettingsActivity,
                    urlEditText.getText().toString().trim()
                )
            }
            binding.selectImageButton.setOnClickListener {
                selectImageLauncher.launch("image/*")
            }
            useDefaultButton.setOnClickListener {
                viewModel.resetMultiModalUrl(this@SettingsActivity)
                urlEditText.setText(viewModel.getMultimodalWebUrl(this@SettingsActivity))
            }
            viewModel.selectedImageUri.observe(this@SettingsActivity) { uri ->
                uri?.let {
                    binding.imagePreview.setImageURI(it)
                    val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        ImageDecoder.decodeBitmap(ImageDecoder.createSource(contentResolver, it))
                    } else {
                        MediaStore.Images.Media.getBitmap(contentResolver, it)
                    }
                    viewModel.fetchQueryMap(bitmap)
                }
            }
            viewModel.fullUrl.observe(this@SettingsActivity) { url ->
                binding.fullUrlTextView.text = url
            }
            loadButton.setOnClickListener {
                val url = viewModel.fullUrl.value ?: return@setOnClickListener
                if (url.isEmpty()) {
                    return@setOnClickListener
                }
                MultimodalWebActivity.startActivity(
                    this@SettingsActivity,
                    url
                )
            }
        }
        // Setup Toolbar back button
        val toolbar: androidx.appcompat.widget.Toolbar = findViewById(R.id.toolbar)
        toolbar.setNavigationOnClickListener {
            finish()
        }
    }
}