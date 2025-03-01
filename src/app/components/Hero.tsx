// app/components/Hero.tsx
import React from 'react';
import styles from './Hero.module.css';

const Hero = () => {
  return (
      <section id="hero" className={styles.hero}>
        <div className={styles.content}>
          <h1 className={styles.title}>비비봇에 오신 것을 환영합니다!</h1>
          <p className={styles.innercontent}>
            비비봇은 디스코드 서버를 위한 혁신적인 봇입니다. 다양한 명령어와 자동화 기능을 통해
            여러분의 커뮤니티 관리와 소통을 더욱 편리하게 만들어줍니다.
          </p>
          <a href="#introduction" className={styles.cta}>
            더 알아보기
          </a>
        </div>
      </section>
  );
};

export default Hero;
