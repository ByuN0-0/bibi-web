const Footer = () => {
  return (
      <>
        <footer className="bg-gray-800">
          <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div>
                <img
                    className="h-8 rounded-full"
                    src="/images/bibi-logo.png"
                    alt="Bot Logo"
                />
                <p className="mt-4 text-gray-300 text-sm">
                  안정적인 서비스를 제공하는 다목적 디스코드 봇입니다.
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">
                  링크
                </h3>
                <ul className="mt-4 space-y-4">
                  <li>
                    <a href="#" className="text-base text-gray-300 hover:text-white">
                      홈
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-base text-gray-300 hover:text-white">
                      명령어
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-base text-gray-300 hover:text-white">
                      가이드
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">
                  지원
                </h3>
                <ul className="mt-4 space-y-4">
                  <li>
                    <a href="#" className="text-base text-gray-300 hover:text-white">
                      FAQ
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-base text-gray-300 hover:text-white">
                      문의하기
                    </a>
                  </li>
                  <li>
                    <a href="#" className="text-base text-gray-300 hover:text-white">
                      피드백
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-400 tracking-wider uppercase">
                  소셜
                </h3>
                <ul className="mt-4 space-y-4">
                  <li>
                    <a
                        href="#"
                        className="text-base text-gray-300 hover:text-white inline-flex items-center"
                    >
                      <i className="fab fa-discord mr-2"></i> 디스코드
                    </a>
                  </li>
                  <li>
                    <a
                        href="#"
                        className="text-base text-gray-300 hover:text-white inline-flex items-center"
                    >
                      <i className="fab fa-github mr-2"></i> 깃허브
                    </a>
                  </li>
                  <li>
                    <a
                        href="#"
                        className="text-base text-gray-300 hover:text-white inline-flex items-center"
                    >
                      <i className="fab fa-twitter mr-2"></i> 트위터
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-8 border-t border-gray-700 pt-8">
              <p className="text-base text-gray-400 text-center">
                © 2024 디스코드 봇. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </>
  );
}

export default Footer;
