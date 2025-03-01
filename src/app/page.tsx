// app/page.tsx
"use client"; // 클라이언트 전용 컴포넌트로 지정

export default function Home() {
  return (
      <>
        {/* 메인 콘텐츠 */}
        <main className="flex-grow pt-16">
          {/* 히어로 섹션 */}
          <div
              className="relative bg-gray-800"
              style={{
                background: "linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)",
                backgroundSize: "400% 400%",
                animation: "gradient 15s ease infinite",
                position: "relative",
                overflow: "hidden",
              }}
          >
            <style jsx>{`
            @keyframes gradient {
              0% {
                background-position: 0% 50%;
              }
              50% {
                background-position: 100% 50%;
              }
              100% {
                background-position: 0% 50%;
              }
            }
          `}</style>
            <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
              <div className="lg:grid lg:grid-cols-12 lg:gap-8">
                <div className="sm:text-center md:max-w-2xl md:mx-auto lg:col-span-6 lg:text-left">
                  <h1 className="text-4xl tracking-tight font-extrabold sm:text-5xl md:text-6xl">
                    <span className="block">당신의 서버를 위한</span>
                    <span className="block text-custom">최고의 디스코드 봇</span>
                  </h1>
                  <p className="mt-3 text-base text-gray-300 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
                    다양한 서비스로 한 번에 해결하세요.
                    안정적인 서비스를 제공합니다.
                  </p>
                  <div className="mt-8 sm:max-w-lg sm:mx-auto sm:text-center lg:text-left">
                    <button className="!rounded-3xl bg-custom hover:bg-blue-600 px-8 py-3 text-base font-medium inline-flex items-center">
                      <i className="fas fa-robot mr-2"></i>
                      지금 시작하기
                    </button>
                  </div>
                </div>
                <div className="mt-12 relative sm:max-w-lg rounded-2xl sm:mx-auto lg:mt-0 lg:max-w-none lg:mx-0 lg:col-span-6 lg:flex lg:items-center">
                  <img
                      src="/images/bibi-logo.png"
                      alt="Bot Illustration"
                      className="w-full rounded-3xl"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 명령어 및 기타 섹션 */}
          <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10 bg-gray-900/95 mt-[-4rem] rounded-2xl backdrop-blur-lg shadow-2xl mx-4 lg:mx-8">
            <div className="lg:grid lg:grid-cols-12 lg:gap-8">
              <div className="lg:col-span-3">
                <nav className="sticky top-20 space-y-4 bg-gray-800/90 p-6 rounded-lg backdrop-blur-lg shadow-xl">
                  <div className="text-lg font-medium mb-4">카테고리</div>
                  <a href="#admin" className="block py-2 text-gray-300 hover:text-white">
                    관리자 명령어
                  </a>
                  <a href="#daily" className="block py-2 text-gray-300 hover:text-white">
                    일상 명령어
                  </a>
                  <a href="#music" className="block py-2 text-gray-300 hover:text-white">
                    음악 명령어
                  </a>
                </nav>
              </div>
              <div className="mt-12 lg:mt-0 lg:col-span-9">
                <div className="space-y-16">
                  <section id="admin">
                    <h2 className="text-2xl font-bold mb-8">관리자 명령어</h2>
                    <div className="bg-gray-800/90 rounded-lg overflow-hidden backdrop-blur-lg shadow-xl">
                      <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                            명령어
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                            설명
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                            사용 예시
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                            필요 권한
                          </th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            /clear
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">
                            채팅을 지워줍니다.
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">
                            /clear 10
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">
                            관리자
                          </td>
                        </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section id="daily">
                    <h2 className={"text-2xl font-bold mb-8"}>일상 명령어</h2>
                    <div className="bg-gray-800/90 rounded-lg overflow-hidden backdrop-blur-lg shadow-xl">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className={"bg-gray-700"}>
                            <tr>
                                <th className={"px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"}>
                                    명령어
                                </th>
                                <th className={"px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"}>
                                    설명
                                </th>
                                <th className={"px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"}>
                                    사용 예시
                                </th>
                                <th className={"px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"}>
                                    필요 권한
                                </th>
                            </tr>
                            </thead>
                          <tbody className={"divide-y divide-gray-700"}>
                          <tr>
                            <td className={"px-6 py-4 whitespace-nowrap text-sm font-medium"}>
                              /help
                            </td>
                            <td className={"px-6 py-4 text-sm text-gray-300"}>
                              도움말을 표시합니다.
                            </td>
                            <td className={"px-6 py-4 text-sm text-gray-300"}>
                              /help
                            </td>
                            <td className={"px-6 py-4 text-sm text-gray-300"}>
                              없음
                            </td>
                          </tr>
                          <tr>
                            <td className={"px-6 py-4 whitespace-nowrap text-sm font-medium"}>
                              /저메추, /점메추
                            </td>
                            <td className={"px-6 py-4 text-sm text-gray-300"}>
                              식사 메뉴를 추천합니다.
                            </td>
                            <td className={"px-6 py-4 text-sm text-gray-300"}>
                              /저메추, /점메추
                            </td>
                            <td className={"px-6 py-4 text-sm text-gray-300"}>
                              없음
                            </td>
                          </tr>
                          <tr>
                            <td className={"px-6 py-4 whitespace-nowrap text-sm font-medium"}>
                              /team
                            </td>
                            <td className={"px-6 py-4 text-sm text-gray-300"}>
                              팀을 2개로 나누어줍니다. (짝수여야 합니다.)
                            </td>
                            <td className={"px-6 py-4 text-sm text-gray-300"}>
                              /team 유저1 유저2 유저3 유저4
                            </td>
                            <td className={"px-6 py-4 text-sm text-gray-300"}>
                              없음
                            </td>
                          </tr>
                          </tbody>
                        </table>
                    </div>


                  </section>

                  <section id="music">
                    <h2 className="text-2xl font-bold mb-8">음악 명령어(추가예정)</h2>
                    <div className="bg-gray-800/90 rounded-lg overflow-hidden backdrop-blur-lg shadow-xl">
                      <table className="min-w-full divide-y divide-gray-700">
                        <thead className="bg-gray-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                            명령어
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                            설명
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                            사용 예시
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                            필요 권한
                          </th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            /재생
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">
                            음악을 재생합니다
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">
                            /재생 노래제목
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">없음</td>
                        </tr>
                        <tr className="bg-gray-800">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            /정지
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">
                            음악을 정지합니다
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">/정지</td>
                          <td className="px-6 py-4 text-sm text-gray-300">없음</td>
                        </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* 푸터 영역 */}

      </>
  );
}
