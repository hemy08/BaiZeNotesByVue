<template>
  <div id="navi-tab">
    <div class="navi-tab-item-btn">
      <button data-index="0" title="文件管理器" class="navi-tab-item file active" @click="onShowFileExplorer">
        <svg viewBox="0 0 32 32" xml:space="preserve" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M28,7v3c0,0.55-0.45,1-1,1H16c-0.35,0-0.68-0.18-0.86-0.49l-1.8-3c-0.1801-0.3-0.19-0.69-0.01-1    C13.51,6.19,13.84,6,14.2,6H27C27.55,6,28,6.45,28,7z"
            fill="#FE9803"
          />
          <path
            d="M31,10v17c0,0.55-0.45,1-1,1H2c-0.55,0-1-0.45-1-1V5c0-0.55,0.45-1,1-1h11c0.35,0,0.68,0.18,0.86,0.49    L16.57,9H30C30.55,9,31,9.45,31,10z"
            fill="#FFC10A"
          />
        </svg>
      </button>
      <button data-index="1" title="大纲" class="navi-tab-item outline" @click="onShowMarkdownTOC">
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M157.538462 265.846154c0 15.753846-13.784615 29.538462-29.538462 29.538461h-59.076923c-15.753846 0-29.538462-13.784615-29.538462-29.538461v-59.076923C39.384615 191.015385 53.169231 177.230769 68.923077 177.230769h59.076923c15.753846 0 29.538462 13.784615 29.538462 29.538462v59.076923z m827.076923-59.076923c0-15.753846-13.784615-29.538462-29.538462-29.538462h-689.230769c-15.753846 0-29.538462 13.784615-29.538462 29.538462v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538461h689.230769c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076923z m-827.076923 275.692307c0-15.753846-13.784615-29.538462-29.538462-29.538461h-59.076923c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076924c0 15.753846 13.784615 29.538462 29.538462 29.538461h59.076923c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076924z m748.307692 0c0-15.753846-13.784615-29.538462-29.538462-29.538461h-610.461538c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076924c0 15.753846 13.784615 29.538462 29.538462 29.538461h610.461538c15.753846 0 29.538462-13.784615 29.538462-29.538461v-59.076924z m-748.307692 275.692308c0-15.753846-13.784615-29.538462-29.538462-29.538461h-59.076923c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538462h59.076923c15.753846 0 29.538462-13.784615 29.538462-29.538462v-59.076923z m827.076923 0c0-15.753846-13.784615-29.538462-29.538462-29.538461h-689.230769c-15.753846 0-29.538462 13.784615-29.538462 29.538461v59.076923c0 15.753846 13.784615 29.538462 29.538462 29.538462h689.230769c15.753846 0 29.538462-13.784615 29.538462-29.538462v-59.076923z"
          ></path>
        </svg>
      </button>
      <button data-index="2" title="邮件" class="navi-tab-item outline" @click="onOpenEmailTool">
        <svg viewBox="0 -0.5 1025 1025" class="icon" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M509.3 606.2c-27.9 0-55.6-9-78.7-26.9L36.4 245.7c-18-15.2-20.2-42.2-5-60.1 15.2-18 42.2-20.2 60.1-5L484.3 513c14.4 11.1 36.5 11.1 52.4-1.2l396.2-331.4c18.1-15.1 45-12.8 60.1 5.4 15.1 18.1 12.7 45-5.4 60.1L590.1 578.3c-24.1 18.7-52.6 27.9-80.8 27.9z"
            fill="#5F6379"
          />
          <path
            d="M894.8 938.6H129.4c-71.3 0-129.4-58-129.4-129.4v-552c0-71.3 58-129.4 129.4-129.4h765.4c71.3 0 129.4 58 129.4 129.4v552.1c0 71.3-58.1 129.3-129.4 129.3zM129.4 213.2c-24.3 0-44 19.8-44 44v552.1c0 24.3 19.8 44 44 44h765.4c24.3 0 44-19.8 44-44V257.2c0-24.3-19.8-44-44-44H129.4z"
            fill="#3688FF"
          />
        </svg>
      </button>
      <button data-index="3" title="浏览器"  class="navi-tab-item outline" @click="onOpenMicrosoftEdge">
        <svg viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
          <path
            fill="#3177bc"
            d="M1.4653988 6.3265778c.3526004-2.77544 2.2447314-5.29318 5.6382665-5.32658003 2.0488113.0391 3.7347257.96736003 4.7365897 2.73760003.503993.92394.66123 1.89408.694625 2.96384v1.25762H5.0042041c.034481 3.1057802 4.5696119 3.0000302 6.5232469 1.63081v2.5280402c-1.143795.68739-3.7375091 1.29964-5.7468025.51206-1.7115172-.64286-2.9304514-2.4323-2.9221025-4.1549502-.055659-2.23471 1.110399-3.71246 2.9221025-4.55291-.3840477.47672-.676258 1.00186-.8293205 1.9091l4.252355.00001s.2487127-2.54111-2.4064211-2.54111c-2.5046593.0885-4.310797 1.54482-5.3321414 3.0362z"
          />
        </svg>
      </button>
      <button data-index="3" title="会议"  class="navi-tab-item outline" @click="onOpenOnlineMeeting">
        <svg viewBox="0 -22.5 256 256" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
          <g>
            <polygon fill="#00832D" points="144.822496 105.321856 169.778926 133.848796 203.341343 155.294133 209.178931 105.50196 203.341343 56.8331137 169.136495 75.6715889">
            </polygon>
            <path d="M0.000557021739,150.659712 L0.000557021739,193.089915 C0.000557021739,202.77838 7.86384724,210.643527 17.5541688,210.643527 L59.9843714,210.643527 L68.7704609,178.585069 L59.9843714,150.659712 L30.8744153,141.873623 L0.000557021739,150.659712 Z" fill="#0066DA">
            </path>
            <polygon fill="#E94235" points="59.9838143 9.9475983e-14 0 59.9838143 30.875715 68.7494798 59.9838143 59.9838143 68.6102243 32.4390893">
            </polygon>
            <polygon fill="#2684FC" points="0.000557021739 150.679394 59.9843714 150.679394 59.9843714 59.9832573 0.000557021739 59.9832573">
            </polygon>
            <path d="M241.658683,25.3977775 L203.341157,56.8342278 L203.341157,155.29339 L241.818362,186.852385 C247.577967,191.364261 256.003849,187.251584 256.003849,179.930462 L256.003849,32.1785888 C256.003849,24.7757699 247.377439,20.6835169 241.658683,25.3977775" fill="#00AC47">
            </path>
            <path d="M144.822496,105.321856 L144.822496,150.659712 L59.9843714,150.659712 L59.9843714,210.643527 L185.787731,210.643527 C195.478053,210.643527 203.341343,202.77838 203.341343,193.089915 L203.341343,155.294133 L144.822496,105.321856 Z" fill="#00AC47">
            </path>
            <path d="M185.787731,0 L59.9843714,0 L59.9843714,59.9838143 L144.822496,59.9838143 L144.822496,105.32167 L203.341343,56.832928 L203.341343,17.5536117 C203.341343,7.86329022 195.478053,0 185.787731,0" fill="#FFBA00">
            </path>
          </g>
        </svg>
      </button>
      <button data-index="1" title="微信" class="navi-tab-item outline" @click="onOpenWeChat">
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
          <g>
            <path
              fill="#F5C0C0"
              d="M58.5,43.2C59,55.8,69.2,66.2,81.7,67.2c3.5,0.2,7-0.2,10.2-1.2c1.7-0.6,8,2.6,11.6,4.4c0.9,0.4,2-0.4,1.6-1.4   c-1.3-3.5-3.2-9.2-2.3-10.2c4.3-4.9,6.8-11.5,6.3-18.7c-0.9-12.6-11.4-22.8-24.1-23.4C70.1,15.9,57.8,28.2,58.5,43.2z"
            />
            <path
              fill="#FF7171"
              d="M82.2,64.8c-0.8,17.8-15.1,32.5-32.8,33.9c-5,0.3-9.8-0.3-14.4-1.7c-2.3-0.8-11.2,3.6-16.4,6.2   c-1.2,0.6-2.8-0.6-2.2-2c1.9-5,4.5-12.9,3.3-14.4c-6.1-6.9-9.5-16.2-8.9-26.4C12.1,42.7,27,28.3,44.8,27.5   C65.8,26.4,83.1,43.8,82.2,64.8z"
            />
            <g>
              <path
                fill="#FFFFFF"
                d="M37.4,53.4h18.4c1.2,0,2.3-1.1,2.3-2.3s-1.1-2.3-2.3-2.3H37.4c-1.2,0-2.3,1.1-2.3,2.3    C34.9,52.3,36,53.4,37.4,53.4z"
              />
              <path
                fill="#FFFFFF"
                d="M55.8,72.6H37.4c-1.2,0-2.3,1.1-2.3,2.3s1.1,2.3,2.3,2.3h18.4c1.2,0,2.3-1.1,2.3-2.3    C58.2,73.7,57.1,72.6,55.8,72.6z"
              />
              <path
                fill="#FFFFFF"
                d="M65.2,60.6H27.9c-1.2,0-2.3,1.1-2.3,2.3s1.1,2.3,2.3,2.3H65c1.2,0,2.3-1.1,2.3-2.3    C67.5,61.7,66.4,60.6,65.2,60.6z"
              />
            </g>
          </g>
        </svg>
      </button>
      <button data-index="1" title="QQ" class="navi-tab-item outline" @click="onOpenQQ">
        <svg xmlns="http://www.w3.org/2000/svg" fill="#ffc107" viewBox="0 0 450 450">
          <path
            d="M261 398a57 32 0 00114 0 57 32 0 00-114 0zm-124 0a57 32 0 00114 0 57 32 0 00-114 0z"
          />
          <path
            fill="#37474f"
            d="M238 149a10 14 0 0 1-20 0 10 14 0 0 1 20 0zm46-13c-6 0-10 6-10 13 0 8 4-4 10-4 5 0 9 12 9 4 0-7-4-13-9-13zm27 14a23 33 0 0 1-46 0 23 33 0 0 1 46 0zm-64 0a23 33 0 0 1-46 0 23 33 0 0 1 46 0zm127 79v-56a119 119 0 0 0-237 0v56c-18 25-35 55-37 78 0 44 13 40 13 40 5 0 15-9 23-20 19 55 65 93 120 93s101-38 120-93c8 11 18 20 23 20 0 0 13 4 13-40 0-23-17-54-37-78z"
          />
          <path d="M183 204a73 13 0 11146 0 73 23 0 11-146 0z" />
          <path fill="#eceff1" d="M171 237a88 132 0 10170 0z" />
          <path
            fill="#ff3d00"
            d="M391 220c-4-14-9-20-19-12-71 38-159 38-230 0-10-7-15-2-19 12s-6 18 6 26l32 15c-6 32-5 63-5 65 1 13 12 12 27 12 14-1 26 0 26-15 0-8 0-27 3-46 56 10 120-1 173-31 11-7 9-11 6-26z"
          />
        </svg>
      </button>
      <button data-index="1" title="网盘" class="navi-tab-item outline" @click="onOpenBaiduDisk">
        <svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 512 512">
          <path
            d="m131 251c41-9 35-58 34-68-2-17-21-45-48-43-33 3-37 50-37 50-5 22 10 70 51 61m76-82c22 0 40-26 40-58s-18-58-40-58c-23 0-41 26-41 58s18 58 41 58m96 4c31 4 50-28 54-53 4-24-16-52-37-57s-48 29-50 52c-3 27 3 54 33 58m120 41c0-12-10-47-46-47s-41 33-41 57c0 22 2 53 47 52s40-51 40-62m-46 102s-46-36-74-75c-36-57-89-34-106-5-18 29-45 48-49 53-4 4-56 33-44 84 11 52 52 51 52 51s30 3 65-5 65 2 65 2 81 27 104-25c22-53-13-80-13-80"
            fill="#2319dc"
          />
          <path
            d="m214 266v34h-28s-29 3-39 35c-3 21 4 34 5 36 1 3 10 19 33 23h53v-128zm-1 107h-21s-15-1-19-18c-3-7 0-16 1-20 1-3 6-11 17-14h22zm38-70v68s1 17 24 23h61v-91h-26v68h-25s-8-1-10-7v-61z"
            fill="#ffffff"
          />
        </svg>
      </button>
      <button data-index="1" title="钉钉" class="navi-tab-item outline" @click="onOpenDingding">
        <svg viewBox="0 -4 48 48" xmlns="http://www.w3.org/2000/svg">
          <g id="Icons" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd">
            <g id="Color-" transform="translate(-300.000000, -164.000000)" fill="#00AAEC">
              <path
                id="Twitter"
                d="M348,168.735283 C346.236309,169.538462 344.337383,170.081618 342.345483,170.324305 C344.379644,169.076201 345.940482,167.097147 346.675823,164.739617 C344.771263,165.895269 342.666667,166.736006 340.418384,167.18671 C338.626519,165.224991 336.065504,164 333.231203,164 C327.796443,164 323.387216,168.521488 323.387216,174.097508 C323.387216,174.88913 323.471738,175.657638 323.640782,176.397255 C315.456242,175.975442 308.201444,171.959552 303.341433,165.843265 C302.493397,167.339834 302.008804,169.076201 302.008804,170.925244 C302.008804,174.426869 303.747139,177.518238 306.389857,179.329722 C304.778306,179.280607 303.256911,178.821235 301.9271,178.070061 L301.9271,178.194294 C301.9271,183.08848 305.322064,187.17082 309.8299,188.095341 C309.004402,188.33225 308.133826,188.450704 307.235077,188.450704 C306.601162,188.450704 305.981335,188.390033 305.381229,188.271578 C306.634971,192.28169 310.269414,195.2026 314.580032,195.280607 C311.210424,197.99061 306.961789,199.605634 302.349709,199.605634 C301.555203,199.605634 300.769149,199.559408 300,199.466956 C304.358514,202.327194 309.53689,204 315.095615,204 C333.211481,204 343.114633,188.615385 343.114633,175.270495 C343.114633,174.831347 343.106181,174.392199 343.089276,173.961719 C345.013559,172.537378 346.684275,170.760563 348,168.735283"
              />
            </g>
          </g>
        </svg>
      </button>
      <button data-index="1" title="Clion" class="navi-tab-item outline" @click="onOpenJetbrainsClion">
        <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient x1="0.241935484%" y1="50%" x2="115.268817%" y2="50%" id="linearGradient-1">
              <stop stop-color="#ED358C" offset="0%"></stop>
              <stop stop-color="#E9388C" offset="16%"></stop>
              <stop stop-color="#DE418C" offset="30%"></stop>
              <stop stop-color="#CC508C" offset="43%"></stop>
              <stop stop-color="#B2658D" offset="57%"></stop>
              <stop stop-color="#90808D" offset="70%"></stop>
              <stop stop-color="#67A18E" offset="83%"></stop>
              <stop stop-color="#37C78F" offset="95%"></stop>
              <stop stop-color="#22D88F" offset="100%"></stop>
            </linearGradient>
            <linearGradient x1="66.7622951%" y1="17.4574468%" x2="28.1967213%" y2="151.840426%" id="linearGradient-2">
              <stop stop-color="#22D88F" offset="9%"></stop>
              <stop stop-color="#029DE0" offset="90%"></stop>
            </linearGradient>
            <linearGradient x1="10618.1424%" y1="-66066%" x2="-1095.23079%" y2="-79666%" id="linearGradient-3">
              <stop stop-color="#22D88F" offset="9%"></stop>
              <stop stop-color="#029DE0" offset="90%"></stop>
            </linearGradient>
            <linearGradient x1="5973.42462%" y1="-73910%" x2="9952.73006%" y2="-74606%" id="linearGradient-4">
              <stop stop-color="#22D88F" offset="9%"></stop>
              <stop stop-color="#029DE0" offset="90%"></stop>
            </linearGradient>
          </defs>
          <g>
            <polygon
              fill="url(#linearGradient-1)"
              points="98.4 103.6 81.2 110.8 96.8 0 155.6 32.4"
            ></polygon>
            <polygon
              fill="url(#linearGradient-2)"
              points="89.2 153.6 97.6 0 23.6 46.4 0 188"
            ></polygon>
            <polygon
              fill="url(#linearGradient-3)"
              points="250.8 76.8 218 9.6 155.6 32.4 110 82.8 0 188 83.2 248.8 187.2 154.4"
            ></polygon>
            <polygon
              fill="url(#linearGradient-4)"
              points="107.6 109.2 93.2 196.8 151.6 242 215.6 256 256 164.8"
            ></polygon>
            <rect fill="#000000" x="48" y="48" width="160" height="160"></rect>
            <path
              d="M63.2,178 L123.2,178 L123.2,188 L63.2,188 L63.2,178 Z M62,102.4 C61.7957616,93.2154633 65.3544128,84.3465202 71.8504665,77.8504665 C78.3465202,71.3544128 87.2154633,67.7957616 96.4,68 C108.8,68 116.4,72 122.4,78.4 L113.2,89.2 C108,84.4 102.8,81.6 96.4,81.6 C85.2,81.6 77.2,90.8 77.2,102.4 C77.2,113.6 85.2,123.2 96.4,123.2 C104,123.2 108.8,120 114,115.6 L123.2,124.8 C116.4,132 108.8,136.8 96,136.8 C86.9129051,136.800629 78.2036965,133.16364 71.8158356,126.700628 C65.4279746,120.237615 61.893093,111.486466 62,102.4 Z M133.2,68.8 L148,68.8 L148,122.8 L176.8,122.8 L176.8,135.2 L133.2,135.2 L133.2,68.8 Z"
              fill="#FFFFFF"
            ></path>
          </g>
        </svg>
      </button>
      <button data-index="1" title="IDEA" class="navi-tab-item outline" @click="onOpenJetbrainsIdea">
        <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient x1="0%" y1="50%" x2="99.7986577%" y2="50%" id="linearGradient-1">
              <stop stop-color="#F97A12" offset="26%"></stop>
              <stop stop-color="#B07B58" offset="46%"></stop>
              <stop stop-color="#577BAE" offset="72%"></stop>
              <stop stop-color="#1E7CE5" offset="91%"></stop>
              <stop stop-color="#087CFA" offset="100%"></stop>
            </linearGradient>
            <linearGradient x1="0.344827586%" y1="34.5396825%" x2="121.182266%" y2="77.6190476%" id="linearGradient-2">
              <stop stop-color="#F97A12" offset="0%"></stop>
              <stop stop-color="#CB7A3E" offset="7%"></stop>
              <stop stop-color="#9E7B6A" offset="15%"></stop>
              <stop stop-color="#757B91" offset="24%"></stop>
              <stop stop-color="#537BB1" offset="33%"></stop>
              <stop stop-color="#387CCC" offset="43%"></stop>
              <stop stop-color="#237CE0" offset="54%"></stop>
              <stop stop-color="#147CEF" offset="66%"></stop>
              <stop stop-color="#0B7CF7" offset="79%"></stop>
              <stop stop-color="#087CFA" offset="100%"></stop>
            </linearGradient>
            <linearGradient x1="78.1690141%" y1="97.7493606%" x2="30.1056338%" y2="-6.62404092%" id="linearGradient-3">
              <stop stop-color="#FE315D" offset="0%"></stop>
              <stop stop-color="#CB417E" offset="8%"></stop>
              <stop stop-color="#9E4E9B" offset="16%"></stop>
              <stop stop-color="#755BB4" offset="25%"></stop>
              <stop stop-color="#5365CA" offset="34%"></stop>
              <stop stop-color="#386DDB" offset="44%"></stop>
              <stop stop-color="#2374E9" offset="54%"></stop>
              <stop stop-color="#1478F3" offset="66%"></stop>
              <stop stop-color="#0B7BF8" offset="79%"></stop>
              <stop stop-color="#087CFA" offset="100%"></stop>
            </linearGradient>
            <linearGradient x1="20%" y1="24.0865385%" x2="103.421589%" y2="132.676282%" id="linearGradient-4">
              <stop stop-color="#FE315D" offset="0%"></stop>
              <stop stop-color="#F63462" offset="4%"></stop>
              <stop stop-color="#DF3A71" offset="10%"></stop>
              <stop stop-color="#C24383" offset="17%"></stop>
              <stop stop-color="#AD4A91" offset="29%"></stop>
              <stop stop-color="#755BB4" offset="55%"></stop>
              <stop stop-color="#1D76ED" offset="92%"></stop>
              <stop stop-color="#087CFA" offset="100%"></stop>
            </linearGradient>
          </defs>
          <g>
            <polygon
              fill="url(#linearGradient-1)"
              points="64.8 199.6 2.8 150.8 33.6 93.6 122 128"
            ></polygon>
            <polygon
              fill="url(#linearGradient-2)"
              points="256 68.4 251.2 216.4 152.8 256 93.6 217.6 180 128 142.4 44.8 176.4 4"
            ></polygon>
            <polygon
              fill="url(#linearGradient-3)"
              points="256 68.4 178 160.4 142.4 44.8 176.4 4"
            ></polygon>
            <polygon
              fill="url(#linearGradient-4)"
              points="123.2 212.4 20.8 249.6 37.2 192 58.4 120.8 0 101.2 37.2 0 117.2 9.6 196.4 100"
            ></polygon>
            <rect fill="#000000" x="48" y="48" width="160" height="160"></rect>
            <path
              d="M63.2,178 L123.2,178 L123.2,188 L63.2,188 L63.2,178 Z M106,80.8 L106,68.8 L73.2,68.8 L73.2,80.8 L82.4,80.8 L82.4,122.8 L73.2,122.8 L73.2,135.2 L106,135.2 L106,122.8 L96.8,122.8 L96.8,80.8 L106,80.8 Z M138,136 C133.433351,136.205984 128.889763,135.242193 124.8,133.2 C121.453966,131.354025 118.472002,128.914237 116,126 L125.2,115.6 C126.861272,117.42513 128.742265,119.03741 130.8,120.4 C132.73613,121.535124 134.957474,122.09046 137.2,122 C139.666127,122.188479 142.064692,121.139107 143.6,119.2 C145.452667,116.813942 146.312461,113.804666 146,110.8 L146,68 L160.8,68 L160.8,111.2 C160.951789,114.737935 160.408195,118.271293 159.2,121.6 C158.144579,124.977032 156.212191,128.013641 153.6,130.4 C149.066749,133.765567 143.638763,135.714074 138,136 Z"
              fill="#FFFFFF"
            ></path>
          </g>
        </svg>
      </button>
      <button data-index="1" title="Goland" class="navi-tab-item outline" @click="onOpenJetbrainsGoland">
        <svg viewBox="128 -160 384 384" xmlns="http://www.w3.org/2000/svg">
          <g>
            <path
              d="M292.533152,13.2950639 L293.657233,14.0455076 C306.869315,22.7704678 316.342129,34.7361275 322.574244,49.1946331 C324.069951,51.4381943 323.072813,52.6846171 320.081398,53.4324709 L315.017741,54.7277932 C303.571167,57.6768058 294.487155,60.1566573 283.191384,63.10567 L276.74841,64.7843862 C274.428264,65.3583626 273.787695,65.1170696 271.320433,62.3073717 L270.972336,61.9081465 C267.453024,57.9195933 264.816991,55.2559574 260.154613,52.878088 L259.255961,52.4353326 C243.551033,44.7075107 228.344673,46.9510719 214.135452,56.1746012 C197.184101,67.1431227 188.459141,83.3466202 188.708425,103.538671 C188.95771,123.481438 202.668362,139.93422 222.361843,142.67635 C239.313195,144.919911 253.522416,138.937081 264.740222,126.223568 C266.983783,123.481438 268.978059,120.490023 271.470905,117.000039 L223.358982,117.000039 C218.124006,117.000039 216.877583,113.759339 218.622575,109.521501 L219.486848,107.487264 C222.690544,100.033179 227.659682,89.3185944 230.887235,83.1925665 L231.591356,81.8743455 C232.452883,80.3801337 234.202861,78.3609287 237.568203,78.3609287 L317.791861,78.3603482 C321.394911,66.9456209 327.24084,56.159659 335.038473,45.9539335 C353.236247,22.0226141 375.17329,9.55838523 404.838154,4.32340907 C430.265181,-0.163713323 454.196501,2.32913245 475.884259,17.0369225 C495.577741,30.4982897 507.792685,48.6960639 511.033385,72.6273834 C515.271222,106.280802 505.549124,133.702105 482.365658,157.134856 C465.912876,173.836922 445.720825,184.306875 422.537359,189.043282 C415.806676,190.289704 409.075992,190.538989 402.594593,191.286843 C379.909697,190.788274 359.219077,184.306875 341.769156,169.3498 C329.496056,158.740849 321.041799,145.701725 316.840932,130.522127 C313.926247,136.409796 310.44016,142.04853 306.370746,147.412757 C288.422257,171.094792 264.989506,185.802582 235.324641,189.791135 C210.894753,193.031835 188.209856,188.295428 168.26709,173.338353 C149.820031,159.378417 139.350079,140.931358 136.607949,117.997177 C133.367249,90.8251575 141.344356,66.3952689 157.797138,44.9567952 C175.496343,21.7733295 198.929093,7.06553943 227.59682,1.8305633 C250.59563,-2.32879605 272.633891,0.235689133 292.533152,13.2950639 L292.533152,13.2950639 Z M411.120284,49.0171223 L410.322415,49.1946331 C387.138949,54.4296092 372.181875,69.1373993 366.697614,92.5701496 C362.210492,112.014347 371.683306,131.707829 389.631795,139.684935 C403.342447,145.667765 417.053099,144.919911 430.265181,138.189228 C449.958663,127.96856 460.6779,112.014347 461.924323,90.575873 C461.675038,87.3351735 461.675038,84.8423277 461.176469,82.3494819 C456.739764,57.9476028 434.511926,44.025432 411.120284,49.0171223 L411.120284,49.0171223 Z M116.415898,94.5644262 C117.413036,94.5644262 117.911605,95.3122799 117.911605,96.3094183 L117.413036,102.292248 C117.413036,103.289387 116.415898,104.03724 115.668044,104.03724 L61.3240061,103.787956 C60.3268678,103.787956 60.0775833,103.040102 60.5761524,102.292248 L64.0661365,96.0601337 C64.5647057,95.3122799 65.561844,94.5644262 66.5589823,94.5644262 L116.415898,94.5644262 Z M121.900159,71.6302451 C122.897297,71.6302451 123.395866,72.3780988 123.146581,73.1259525 L121.152305,79.1087824 C120.90302,80.1059207 119.905882,80.6044899 118.908744,80.6044899 L0.99713831,80.8537744 C0,80.8537744 -0.249284578,80.3552053 0.249284578,79.6073515 L5.48426071,72.8766679 C5.98282987,72.1288142 7.22925276,71.6302451 8.22639107,71.6302451 L121.900159,71.6302451 Z M134.862957,48.6960639 C135.860095,48.6960639 136.109379,49.4439176 135.61081,50.1917714 L131.372973,56.6731704 C130.874403,57.4210241 129.62798,58.1688779 128.880127,58.1688779 L38.6391096,57.9195933 C37.6419713,57.9195933 37.3926867,57.4210241 37.8912558,56.6731704 L43.126232,49.9424868 C43.6248011,49.1946331 44.871224,48.6960639 45.8683623,48.6960639 L134.862957,48.6960639 Z"
              fill="#00ACD7"
            ></path>
          </g>
        </svg>
      </button>
      <button data-index="1" title="PyCharm" class="navi-tab-item outline" @click="onOpenJetbrainsPycharm">
        <svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient x1="-46.5647482%" y1="50%" x2="90.4496403%" y2="50%" id="linearGradient-1">
              <stop stop-color="#21D789" offset="0%"></stop>
              <stop stop-color="#07C3F2" offset="100%"></stop>
            </linearGradient>
            <linearGradient x1="-53.6961722%" y1="105.498047%" x2="133.923445%" y2="-7.578125%" id="linearGradient-2">
              <stop stop-color="#FCF84A" offset="1%"></stop>
              <stop stop-color="#A7EB62" offset="11%"></stop>
              <stop stop-color="#5FE077" offset="21%"></stop>
              <stop stop-color="#32DA84" offset="27%"></stop>
              <stop stop-color="#21D789" offset="31%"></stop>
              <stop stop-color="#21D789" offset="58%"></stop>
              <stop stop-color="#21D789" offset="60%"></stop>
              <stop stop-color="#20D68C" offset="69%"></stop>
              <stop stop-color="#1ED497" offset="76%"></stop>
              <stop stop-color="#19D1A9" offset="83%"></stop>
              <stop stop-color="#13CCC2" offset="90%"></stop>
              <stop stop-color="#0BC6E1" offset="97%"></stop>
              <stop stop-color="#07C3F2" offset="100%"></stop>
            </linearGradient>
            <linearGradient x1="30.7014388%" y1="115.958904%" x2="77.7517986%" y2="22.2488584%" id="linearGradient-3">
              <stop stop-color="#21D789" offset="0%"></stop>
              <stop stop-color="#24D788" offset="16%"></stop>
              <stop stop-color="#2FD886" offset="30%"></stop>
              <stop stop-color="#41DA82" offset="44%"></stop>
              <stop stop-color="#5ADC7D" offset="56%"></stop>
              <stop stop-color="#7AE077" offset="69%"></stop>
              <stop stop-color="#A1E36E" offset="81%"></stop>
              <stop stop-color="#CFE865" offset="93%"></stop>
              <stop stop-color="#F1EB5E" offset="100%"></stop>
            </linearGradient>
            <linearGradient x1="-9.66216216%" y1="201.742857%" x2="118.558559%" y2="-16.9428571%" id="linearGradient-4">
              <stop stop-color="#21D789" offset="0%"></stop>
              <stop stop-color="#24D788" offset="6%"></stop>
              <stop stop-color="#2FD886" offset="11%"></stop>
              <stop stop-color="#41DA82" offset="16%"></stop>
              <stop stop-color="#5ADD7D" offset="21%"></stop>
              <stop stop-color="#79E077" offset="25%"></stop>
              <stop stop-color="#7CE076" offset="26%"></stop>
              <stop stop-color="#8CE173" offset="50%"></stop>
              <stop stop-color="#B2E56B" offset="92%"></stop>
            </linearGradient>
            <linearGradient x1="111.835165%" y1="50.480167%" x2="-14.2197802%" y2="49.3632568%" id="linearGradient-5">
              <stop stop-color="#FCF84A" offset="39%"></stop>
              <stop stop-color="#ECF451" offset="54%"></stop>
              <stop stop-color="#C2E964" offset="83%"></stop>
              <stop stop-color="#B2E56B" offset="92%"></stop>
            </linearGradient>
          </defs>
          <g>
            <polygon
              fill="url(#linearGradient-1)"
              points="179.6 40.4 254.4 102.4 227.2 157.2 182.4 144.8 143.2 144.8"
            ></polygon>
            <polygon
              fill="url(#linearGradient-2)"
              points="104 80.8 89.6 157.2 88.4 183.6 51.6 199.2 0 204.8 15.6 39.2 109.6 0 167.2 38"
            ></polygon>
            <polygon
              fill="url(#linearGradient-3)"
              points="104 80.8 111.2 228.4 87.6 256 0 204.8 72 97.2"
            ></polygon>
            <polygon fill="url(#linearGradient-4)" points="200.8 70 112 70 190.4 0"></polygon>
            <polygon
              fill="url(#linearGradient-5)"
              points="256 228.8 178 255.6 74 226.4 104 80.8 116 70 179.6 64 173.6 127.6 224 108"
            ></polygon>
            <rect fill="#000000" x="48" y="48" width="160" height="160"></rect>
            <path
              d="M63.2,178 L123.2,178 L123.2,188 L63.2,188 L63.2,178 Z M62.8,68.8 L90,68.8 C106,68.8 115.2,78 115.2,91.6 C115.2,106.8 103.2,114.8 88.4,114.8 L77.2,114.8 L77.2,134.8 L62.8,134.8 L62.8,68.8 L62.8,68.8 Z M100.4,92.4 C100.4,86 96,82.4 88.4,82.4 L77.2,82.4 L77.2,102.8 L88.8,102.8 C96.66,102.8 100.4,98 100.4,92.4 Z M120.8,102.4 C120.595762,93.2154633 124.154413,84.3465202 130.650467,77.8504665 C137.14652,71.3544128 146.015463,67.7957616 155.2,68 C167.6,68 175.2,72 181.2,78.4 L172,89.2 C166.8,84.4 161.6,81.6 155.2,81.6 C144,81.6 136,90.8 136,102.4 C136,113.6 144,123.2 155.2,123.2 C162.8,123.2 167.6,120 172.8,115.6 L182,124.8 C175.2,132 167.6,136.8 154.8,136.8 C145.712905,136.800629 137.003697,133.16364 130.615836,126.700628 C124.227975,120.237615 120.693093,111.486466 120.8,102.4 Z"
              fill="#FFFFFF"
            ></path>
          </g>
        </svg>
      </button>
      <button data-index="1" title="RustRover" class="navi-tab-item outline" @click="onOpenJetbrainsRustRover">
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <g clip-path="url(#clip0_4372_12949)">
            <path d="M5.81836 48.0521L5.8201 59.9276C5.8201 62.1769 7.64352 63.9998 9.89283 63.9998H21.3994C22.5881 63.9998 23.718 63.4802 24.4918 62.5778L57.2016 24.4164C57.8341 23.678 58.182 22.7378 58.182 21.7656V9.89011C58.182 7.6408 56.3586 5.81738 54.1093 5.81738H42.6009C41.4122 5.81738 40.2823 6.33695 39.5085 7.23935L6.79872 45.4008C6.1657 46.1391 5.81836 47.0793 5.81836 48.0521Z" fill="#00D886"/>
            <path d="M5.81836 49.4806V59.9271C5.81836 62.1764 7.64178 63.9999 9.89109 63.9999H22.9837C23.1763 63.9999 23.3689 63.9859 23.5597 63.9591L60.5034 58.682C62.5101 58.3952 64.0002 56.6771 64.0002 54.65V38.977C64.0002 36.7271 62.1762 34.9037 59.9263 34.9043L41.3878 34.909C40.9503 34.909 40.5157 34.9794 40.1008 35.1178L8.60294 45.6173C6.9401 46.1718 5.81836 47.7282 5.81836 49.4812V49.4806Z" fill="url(#paint0_linear_4372_12949)"/>
            <path d="M0 4.07273V38.041C0 39.6701 0.971054 41.1427 2.46807 41.7844L39.9587 57.8525C40.4654 58.0695 41.0118 58.1818 41.5633 58.1818H59.9273C62.1766 58.1818 64 56.3584 64 54.1091V36.1431C64 35.3385 63.7614 34.5518 63.3146 33.8822L41.9113 1.81353C41.1561 0.681309 39.8854 0.00174545 38.5239 0.00174545L4.07273 0C1.82342 0 0 1.82342 0 4.07273Z" fill="url(#paint1_linear_4372_12949)"/>
            <path d="M52 12H12V52H52V12Z" fill="black" />
            <path d="M33.333 44H17.333V46.6669H33.333V44Z" fill="white" />
            <path d="M52 12H12V52H52V12Z" fill="black" />
            <path d="M43.5721 32L40.0008 25.9915C40.239 25.9157 40.4921 25.8606 40.7114 25.759C41.5259 25.3573 42.1509 24.8079 42.5866 24.0985C43.0291 23.3885 43.2507 22.5717 43.2507 21.6338C43.2507 20.6959 43.0326 19.9061 42.5969 19.2098C42.1682 18.5136 41.554 17.9643 40.7538 17.5757C39.9537 17.1871 39.029 17 37.9786 17H31.5391V32H34.4641V26.3348H36.9885L40.2177 32H43.5716H43.5721ZM34.4652 19.4377H37.7869C38.28 19.4377 38.7082 19.5313 39.0726 19.7058C39.444 19.8929 39.7299 20.1477 39.9296 20.483C40.1294 20.8176 40.2298 21.2062 40.2298 21.6613C40.2298 22.1165 40.1299 22.5051 39.9296 22.8535C39.7293 23.1882 39.444 23.443 39.0726 23.6301C38.7082 23.8178 38.28 23.8982 37.7869 23.8982H34.4652V19.4383V19.4377Z" fill="white"/>
            <path d="M20.0252 26.3348H22.5496L25.7789 32H29.1327L25.5613 25.9915C25.7995 25.9157 26.0527 25.8606 26.2719 25.759C27.0864 25.3573 27.7109 24.8079 28.1471 24.0985C28.5897 23.3885 28.8112 22.5717 28.8112 21.6338C28.8112 20.6959 28.5931 19.9061 28.1575 19.2098C27.7287 18.5136 27.1145 17.9643 26.3144 17.5757C25.5143 17.1871 24.5896 17 23.5392 17H17.0996V32H20.0246V26.3348H20.0252ZM20.0252 19.4377H23.3469C23.8399 19.4377 24.2681 19.5313 24.6326 19.7058C25.004 19.8929 25.2898 20.1477 25.4901 20.483C25.6899 20.8176 25.7903 21.2062 25.7903 21.6613C25.7903 22.1165 25.6905 22.5051 25.4901 22.8535C25.2898 23.1882 25.0046 23.443 24.6326 23.6301C24.2681 23.8178 23.8399 23.8982 23.3469 23.8982H20.0252V19.4383V19.4377Z" fill="white"/>
            <path d="M33 44H17V47H33V44Z" fill="white" />
          </g>
          <defs>
            <linearGradient id="paint0_linear_4372_12949" x1="7.62141" y1="64.7172" x2="61.2476" y2="39.8544" gradientUnits="userSpaceOnUse">
              <stop offset="0.08" stop-color="#00D886"/>
              <stop offset="0.46" stop-color="#FFAB00"/>
            </linearGradient>
            <linearGradient id="paint1_linear_4372_12949" x1="60.0186" y1="59.7777" x2="1.31316" y2="1.07287" gradientUnits="userSpaceOnUse">
              <stop offset="0.19" stop-color="#FFAB00"/>
              <stop offset="0.83" stop-color="#FF004C"/>
            </linearGradient>
            <clipPath id="clip0_4372_12949">
              <rect width="64" height="64" fill="white"/>
            </clipPath>
          </defs>
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineEmits } from 'vue'

let currentNaviTal = 'file-explorer'

// 定义 emit 函数
const emit = defineEmits(['update:navi:tab'])

function onShowFileExplorer() {
  if (currentNaviTal === 'file-explorer') {
    // 隐藏文件资源管理器
    emit('update:navi:tab', 'switch-open-close')
  } else {
    // 切换文件资源管理器
    emit('update:navi:tab', 'file-explorer')
    currentNaviTal = 'file-explorer'
  }
}

function onShowMarkdownTOC() {
  if (currentNaviTal === 'markdown-toc') {
    // 隐藏文件资源管理器
    emit('update:navi:tab', 'switch-open-close')
  } else {
    // 切换markdown导航栏
    currentNaviTal = 'markdown-toc'
    emit('update:navi:tab', 'markdown-toc')
  }
}

function onOpenEmailTool() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send(
    'navi-tab-open-exe',
    'D:\\yeah.net\\MailMaster\\Application\\mailmaster.exe'
  )
}

function onOpenMicrosoftEdge() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send(
    'navi-tab-open-exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  )
}

function onOpenWeChat() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send('navi-tab-open-exe', 'D:\\Tencent\\WeChat\\WeChat.exe')
}

function onOpenOnlineMeeting() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send(
    'navi-tab-open-exe',
    'D:\\yeah.net\\MailMaster\\Application\\mailmaster.exe'
  )
}

function onOpenQQ() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send('navi-tab-open-exe', 'D:\\Tencent\\QQ\\QQ.exe')
}

function onOpenBaiduDisk() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send(
    'navi-tab-open-exe',
    'D:\\BaiduNetdisk\\BaiduNetdisk.exe'
  )
}

function onOpenDingding() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send(
    'navi-tab-open-exe',
    'D:\\DingDing\\DingtalkLauncher.exe'
  )
}

function onOpenJetbrainsIdea() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send(
    'navi-tab-open-exe',
    'D:\\Jetbrains\\IntelliJ IDEA Ultimate\\bin\\idea64.exe'
  )
}

function onOpenJetbrainsClion() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send(
    'navi-tab-open-exe',
    'D:\\Jetbrains\\CLion\\bin\\clion64.exe'
  )
}

function onOpenJetbrainsGoland() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send(
    'navi-tab-open-exe',
    'D:\\Jetbrains\\GoLand\\bin\\goland64.exe'
  )
}

function onOpenJetbrainsPycharm() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send(
    'navi-tab-open-exe',
    'D:\\Jetbrains\\PyCharm Professional\\bin\\pycharm64.exe'
  )
}

function onOpenJetbrainsRustRover() {
  console.log('navi-tab-open-exe')
  window.electron.ipcRenderer.send(
    'navi-tab-open-exe',
    'D:\\Jetbrains\\RustRover\\bin\\rustrover64.exe'
  )
}
</script>

<style scoped>
.navi-tab-item-btn {
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: white;
  margin: 1px;
}

.navi-tab-item {
  width: 100%;
  background-color: white;
  color: white;
  fill: #986801;
  border: none; /* 去掉外边框 */
  margin-top: 10px;
}

.navi-tab-item:hover {
  background-color: grey;
}
</style>
