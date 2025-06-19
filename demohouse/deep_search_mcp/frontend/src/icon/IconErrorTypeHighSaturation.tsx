// Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
// Licensed under the 【火山方舟】原型应用软件自用许可协议
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at 
//     https://www.volcengine.com/docs/82379/1433703
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, { SVGProps } from "react";

interface Props extends SVGProps<SVGSVGElement> {
  width?: string;
  height?: string;
  className?: string;
  spin?: boolean;
}

const IconErrorTypeHighSaturation = (props: Props) => {
  const {
    width = "1em",
    height = "1em",
    className = "",
    spin = false,
    ...restProps
  } = props;

  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: <explanation>
    <svg
      width={width}
      height={height}
      className={`${className} ${spin ? "force-icon-loading" : ""}`}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...restProps}
    >
      <g filter="url(#svg_0666da479c__filter0_dii_52_8283)">
        <path
          d="M10.2086 94.5473L53.1279 22.5311C56.2304 17.3252 63.7696 17.3252 66.8721 22.5311L109.791 94.5473C112.969 99.8799 109.127 106.643 102.919 106.643H17.0807C10.873 106.643 7.03053 99.8799 10.2086 94.5473Z"
          fill="url(#svg_0666da479c__paint0_linear_52_8283)"
        />
      </g>
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M53.6432 22.8381L10.7239 94.8543C7.78423 99.7869 11.3385 106.043 17.0806 106.043H102.919C108.661 106.043 112.216 99.7869 109.276 94.8543L66.3567 22.8381C63.4868 18.0226 56.5131 18.0226 53.6432 22.8381ZM53.1278 22.5309L10.2085 94.5471C7.03047 99.8797 10.8729 106.643 17.0806 106.643H102.919C109.127 106.643 112.969 99.8797 109.791 94.5471L66.8721 22.5309C63.7695 17.325 56.2304 17.325 53.1278 22.5309Z"
        fill="url(#svg_0666da479c__paint1_linear_52_8283)"
      />
      <path
        d="M20.3311 90.9539L54.9229 32.2556C57.2465 28.3127 62.9517 28.3185 65.2674 32.2661L99.6996 90.9643C102.046 94.9642 99.1615 100 94.5243 100H25.5003C20.8576 100 17.974 94.9537 20.3311 90.9539Z"
        fill="url(#svg_0666da479c__paint2_linear_52_8283)"
      />
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M55.4432 32.562L20.8514 91.2603C18.7315 94.8576 21.3249 99.3962 25.5003 99.3962H94.5244C98.6949 99.3962 101.289 94.8671 99.1789 91.2697L64.7466 32.5715C62.664 29.0211 57.533 29.0159 55.4432 32.562ZM54.923 32.2555L20.3312 90.9538C17.974 94.9535 20.8577 100 25.5003 100H94.5244C99.1616 100 102.046 94.9641 99.6997 90.9642L65.2674 32.2659C62.9518 28.3183 57.2466 28.3126 54.923 32.2555Z"
        fill="url(#svg_0666da479c__paint3_linear_52_8283)"
      />
      <g filter="url(#svg_0666da479c__filter1_dii_52_8283)">
        <path
          d="M58.8613 76.9388L55.4027 52.2371C55.1564 50.4776 55.9358 48.7319 57.4103 47.7408C58.9763 46.6881 61.0237 46.6881 62.5897 47.7408C64.0641 48.7319 64.8436 50.4776 64.5972 52.2371L61.1386 76.9388C61.0591 77.5067 60.5734 77.9291 60 77.9291C59.4266 77.9291 58.9408 77.5067 58.8613 76.9388Z"
          fill="url(#svg_0666da479c__paint4_linear_52_8283)"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M62.4499 47.9482C60.9682 46.9522 59.0311 46.9522 57.5494 47.9482C56.1544 48.8859 55.4169 50.5376 55.65 52.2023L59.1086 76.904C59.1708 77.3484 59.5509 77.679 59.9997 77.679C60.4484 77.679 60.8285 77.3484 60.8907 76.904L64.3493 52.2023C64.5824 50.5376 63.8449 48.8859 62.4499 47.9482ZM57.2705 47.5332C58.9208 46.4238 61.0785 46.4238 62.7288 47.5332C64.2827 48.5777 65.1041 50.4174 64.8445 52.2716L61.3859 76.9734C61.2891 77.6647 60.6977 78.179 59.9997 78.179C59.3016 78.179 58.7102 77.6647 58.6134 76.9734L55.1548 52.2716C54.8952 50.4174 55.7166 48.5777 57.2705 47.5332Z"
          fill="url(#svg_0666da479c__paint5_linear_52_8283)"
        />
        <ellipse
          cx="60"
          cy="87.754"
          rx="5"
          ry="4.912"
          fill="url(#svg_0666da479c__paint6_linear_52_8283)"
        />
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M60 83.0923C57.3724 83.0923 55.25 85.1838 55.25 87.7545C55.25 90.3252 57.3724 92.4166 60 92.4166C62.6275 92.4166 64.7499 90.3252 64.7499 87.7545C64.7499 85.1838 62.6275 83.0923 60 83.0923ZM54.75 87.7545C54.75 84.8993 57.1047 82.5923 60 82.5923C62.8952 82.5923 65.2499 84.8993 65.2499 87.7545C65.2499 90.6096 62.8952 92.9166 60 92.9166C57.1047 92.9166 54.75 90.6096 54.75 87.7545Z"
          fill="url(#svg_0666da479c__paint7_linear_52_8283)"
        />
      </g>
      <defs>
        <linearGradient
          id="svg_0666da479c__paint0_linear_52_8283"
          x1="96.428"
          y1="24.481"
          x2="45.894"
          y2="131.886"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#EBEBEC" />
          <stop offset=".855" stop-color="#EDEDEE" />
        </linearGradient>
        <linearGradient
          id="svg_0666da479c__paint1_linear_52_8283"
          x1="15.563"
          y1="5.63"
          x2="62.736"
          y2="106.904"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#E0DEDE" />
          <stop offset=".192" stop-color="#E7E7E7" />
          <stop offset=".704" stop-color="#D9D9D9" />
          <stop offset=".963" stop-color="#C3C3C7" />
        </linearGradient>
        <linearGradient
          id="svg_0666da479c__paint2_linear_52_8283"
          x1="89.412"
          y1="33.279"
          x2="48.546"
          y2="120.053"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#fff" />
          <stop offset=".855" stop-color="#fff" />
        </linearGradient>
        <linearGradient
          id="svg_0666da479c__paint3_linear_52_8283"
          x1="24.121"
          y1="18.044"
          x2="62.27"
          y2="99.865"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#E2E2E2" />
          <stop offset=".192" stop-color="#EEE" />
          <stop offset=".704" stop-color="#E3E3E3" />
          <stop offset=".963" stop-color="#C3C3C7" />
        </linearGradient>
        <linearGradient
          id="svg_0666da479c__paint4_linear_52_8283"
          x1="58.492"
          y1="48.387"
          x2="72.204"
          y2="54.805"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#748BEE" />
          <stop offset=".44" stop-color="#5C7BFF" />
          <stop offset="1" stop-color="#3B5EEF" />
        </linearGradient>
        <linearGradient
          id="svg_0666da479c__paint5_linear_52_8283"
          x1="58.778"
          y1="57.686"
          x2="68.321"
          y2="62.511"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#95A9FF" />
          <stop offset="1" stop-color="#304ECB" />
        </linearGradient>
        <linearGradient
          id="svg_0666da479c__paint6_linear_52_8283"
          x1="58.492"
          y1="83.577"
          x2="63.536"
          y2="91.249"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#5C7BFF" />
          <stop offset="1" stop-color="#3B5EEF" />
        </linearGradient>
        <linearGradient
          id="svg_0666da479c__paint7_linear_52_8283"
          x1="58.779"
          y1="86.438"
          x2="62.017"
          y2="91.76"
          gradientUnits="userSpaceOnUse"
        >
          <stop stop-color="#95A9FF" />
          <stop offset="1" stop-color="#304ECB" />
        </linearGradient>
        <filter
          id="svg_0666da479c__filter0_dii_52_8283"
          x="8.536"
          y="18.094"
          width="103.993"
          height="90.679"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx=".532" dy="1.065" />
          <feGaussianBlur stdDeviation=".532" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0" />
          <feBlend
            in2="BackgroundImageFix"
            result="effect1_dropShadow_52_8283"
          />
          <feBlend
            in="SourceGraphic"
            in2="effect1_dropShadow_52_8283"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="1.597" dy="1.597" />
          <feGaussianBlur stdDeviation=".532" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1 0" />
          <feBlend in2="shape" result="effect2_innerShadow_52_8283" />
          <feColorMatrix
            in="SourceAlpha"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="-1.597" dy="-1.597" />
          <feGaussianBlur stdDeviation=".266" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix values="0 0 0 0 0.879167 0 0 0 0 0.879167 0 0 0 0 0.879167 0 0 0 1 0" />
          <feBlend
            in2="effect2_innerShadow_52_8283"
            result="effect3_innerShadow_52_8283"
          />
        </filter>
        <filter
          id="svg_0666da479c__filter1_dii_52_8283"
          x="53.75"
          y="45.701"
          width="12.5"
          height="48.715"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy=".5" />
          <feGaussianBlur stdDeviation=".5" />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix values="0 0 0 0 0.831152 0 0 0 0 0.863663 0 0 0 0 1 0 0 0 1 0" />
          <feBlend
            in2="BackgroundImageFix"
            result="effect1_dropShadow_52_8283"
          />
          <feBlend
            in="SourceGraphic"
            in2="effect1_dropShadow_52_8283"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx=".5" />
          <feGaussianBlur stdDeviation=".5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix values="0 0 0 0 0.720833 0 0 0 0 0.775407 0 0 0 0 1 0 0 0 1 0" />
          <feBlend in2="shape" result="effect2_innerShadow_52_8283" />
          <feColorMatrix
            in="SourceAlpha"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dx="-.5" dy="-1" />
          <feGaussianBlur stdDeviation=".5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix values="0 0 0 0 0.206667 0 0 0 0 0.317086 0 0 0 0 0.775 0 0 0 1 0" />
          <feBlend
            in2="effect2_innerShadow_52_8283"
            result="effect3_innerShadow_52_8283"
          />
        </filter>
      </defs>
    </svg>
  );
};

export default IconErrorTypeHighSaturation;
