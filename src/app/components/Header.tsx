
const Header = () => {
  return (
      <>
        {/* 네비게이션 영역 */}
        <nav className="fixed w-full bg-gray-800 border-b border-gray-700 z-50">
          <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="flex-shrink-0 flex items-center">
                  <img
                      className="h-8 w-auto rounded-full"
                      src="/images/bibi-logo.png"
                      alt="Bot Logo"
                  />
                  <span className="ml-2 text-xl font-bold">비비</span>
                </div>
                <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                  <a
                      href="#"
                      className="border-custom text-custom border-b-2 inline-flex items-center px-1 pt-1 text-sm font-medium"
                  >
                    홈
                  </a>
                  <a
                      href="#"
                      className="border-transparent hover:border-gray-300 hover:text-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    명령어
                  </a>
                  <a
                      href="#"
                      className="border-transparent hover:border-gray-300 hover:text-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    가이드
                  </a>
                  <a
                      href="#"
                      className="border-transparent hover:border-gray-300 hover:text-gray-300 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
                  >
                    지원
                  </a>
                </div>
              </div>
              <div className="flex items-center">
                <button className="!rounded-2xl bg-custom hover:bg-blue-600 px-4 py-2 text-sm font-medium">
                  봇 초대하기
                </button>
              </div>
            </div>
          </div>
        </nav>
      </>
  );
};

export default Header;
