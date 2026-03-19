package com.avionix.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.Map;

@SpringBootApplication
public class GatewayServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(GatewayServiceApplication.class, args);
    }
}

@RestController
class FallbackController {

    @GetMapping("/fallback")
    public Mono<Map<String, Object>> fallback() {
        return Mono.just(Map.of(
            "success",   false,
            "error",     Map.of("code", "SERVICE_UNAVAILABLE",
                                "message", "Upstream service is temporarily unavailable"),
            "timestamp", Instant.now().toString()
        ));
    }
}
