package com.avionix.snet;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SnetServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(SnetServiceApplication.class, args);
    }
}
