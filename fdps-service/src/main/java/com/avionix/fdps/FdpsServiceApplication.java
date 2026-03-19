package com.avionix.fdps;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FdpsServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(FdpsServiceApplication.class, args);
    }
}
