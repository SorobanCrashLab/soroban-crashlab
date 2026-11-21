/*
 * YARA Rules: Cryptominer Detection
 * 
 * Detects cryptocurrency mining software and related artifacts.
 * Includes both legitimate miners (when unauthorized) and malware miners.
 */

rule XMRig_Miner {
    meta:
        description = "XMRig Monero miner detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "cryptominer"
        tags = ["monero", "xmrig", "cryptominer"]
        reference = "https://xmrig.com/"
    strings:
        $xmrig1 = "xmrig" ascii wide nocase
        $xmrig2 = "XMRig" ascii wide
        $donate = "donate-level" ascii wide
        $pools = "pools" ascii wide
        $stratum = "stratum+tcp://" ascii wide
        $stratum_ssl = "stratum+ssl://" ascii wide
        $algo = "algorithm" ascii wide nocase
        $rx = "rx/" ascii wide nocase
        $cn = "cn/" ascii wide nocase
        $randomx = "randomx" ascii wide nocase
        $config = "config.json" ascii wide
    condition:
        ($xmrig1 or $xmrig2) and 2 of ($donate, $pools, $stratum, $stratum_ssl, $algo, $rx, $cn, $randomx)
}

rule XMRig_Config {
    meta:
        description = "XMRig configuration file detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "cryptominer"
    strings:
        $config1 = "\"pools\"" ascii wide
        $config2 = "\"donate-level\"" ascii wide
        $config3 = "\"algo\"" ascii wide
        $config4 = "\"url\"" ascii wide
        $config5 = "\"user\"" ascii wide
        $config6 = "\"pass\"" ascii wide
    condition:
        4 of them
}

rule CoinHive_Miner {
    meta:
        description = "CoinHive browser miner detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "cryptominer"
        tags = ["coinhive", "browser-miner", "javascript"]
        reference = "https://coinhive.com/"
    strings:
        $coinhive1 = "coinhive" ascii wide nocase
        $coinhive2 = "coin-hive" ascii wide nocase
        $authedmine = "authedmine" ascii wide nocase
        $cryptonight = "cryptonight" ascii wide nocase
        $wasm = "wasm" ascii wide nocase
        $throttle = "throttle" ascii wide nocase
    condition:
        any of them
}

rule Generic_Cryptominer {
    meta:
        description = "Generic cryptominer patterns"
        author = "CrashLab Security Team"
        severity = "medium"
        category = "cryptominer"
        tags = ["generic", "miner"]
    strings:
        $stratum1 = "stratum+tcp://" ascii wide
        $stratum2 = "stratum+ssl://" ascii wide
        $stratum3 = "stratum://" ascii wide
        $getwork = "getwork" ascii wide
        $submit = "submit" ascii wide
        $difficulty = "difficulty" ascii wide
        $hashrate = "hashrate" ascii wide
        $shares = "shares" ascii wide
        $accepted = "accepted" ascii wide
        $rejected = "rejected" ascii wide
        $miner = "miner" ascii wide nocase
        $mining = "mining" ascii wide nocase
        $pool = "pool" ascii wide nocase
        $worker = "worker" ascii wide nocase
        $wallet = "wallet" ascii wide nocase
        $address = "address" ascii wide nocase
    condition:
        5 of them
}

rule CPUMiner_Opt {
    meta:
        description = "CPUMiner-opt detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "cryptominer"
        reference = "https://github.com/JayDDee/cpuminer-opt"
    strings:
        $cpuminer1 = "cpuminer" ascii wide nocase
        $cpuminer2 = "cpuminer-opt" ascii wide nocase
        $scrypt = "scrypt" ascii wide nocase
        $sha256d = "sha256d" ascii wide nocase
        $x11 = "x11" ascii wide nocase
        $x13 = "x13" ascii wide nocase
        $x15 = "x15" ascii wide nocase
    condition:
        ($cpuminer1 or $cpuminer2) and 2 of ($scrypt, $sha256d, $x11, $x13, $x15)
}

rule BFGMiner {
    meta:
        description = "BFGMiner detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "cryptominer"
        reference = "https://github.com/luke-jr/bfgminer"
    strings:
        $bfgminer1 = "bfgminer" ascii wide nocase
        $bfgminer2 = "BFGMiner" ascii wide
    condition:
        any of them
}

rule CGMiner {
    meta:
        description = "CGMiner detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "cryptominer"
        reference = "https://github.com/ckolivas/cgminer"
    strings:
        $cgminer1 = "cgminer" ascii wide nocase
        $cgminer2 = "CGMiner" ascii wide
    condition:
        any of them
}

rule Ethminer {
    meta:
        description = "Ethminer (Ethereum miner) detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "cryptominer"
        reference = "https://github.com/ethereum-mining/ethminer"
    strings:
        $ethminer1 = "ethminer" ascii wide nocase
        $ethminer2 = "Ethminer" ascii wide
        $ethash = "ethash" ascii wide nocase
        $dag = "dag" ascii wide nocase
        $epoch = "epoch" ascii wide nocase
    condition:
        ($ethminer1 or $ethminer2) and 1 of ($ethash, $dag, $epoch)
}

rule T_Rex_Miner {
    meta:
        description = "T-Rex miner detection (NVIDIA)"
        author = "CrashLab Security Team"
        severity = "high"
        category = "cryptominer"
        reference = "https://github.com/trexminer/T-Rex"
    strings:
        $trex1 = "t-rex" ascii wide nocase
        $trex2 = "T-Rex" ascii wide
        $trex3 = "T_Rex" ascii wide
    condition:
        any of them
}

rule LolMiner {
    meta:
        description = "lolMiner detection (AMD/NVIDIA)"
        author = "CrashLab Security Team"
        severity = "high"
        category = "cryptominer"
        reference = "https://github.com/Lolliedieb/lolMiner-releases"
    strings:
        $lol1 = "lolminer" ascii wide nocase
        $lol2 = "lolMiner" ascii wide
    condition:
        any of them
}

rule GMiner {
    meta:
        description = "GMiner detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "cryptominer"
    strings:
        $gminer1 = "gminer" ascii wide nocase
        $gminer2 = "GMiner" ascii wide
    condition:
        any of them
}

rule NB_Miner {
    meta:
        description = "NBMiner detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "cryptominer"
    strings:
        $nbminer1 = "nbminer" ascii wide nocase
        $nbminer2 = "NBMiner" ascii wide
    condition:
        any of them
}

rule Crypto_Mining_Pool_Domains {
    meta:
        description = "Known cryptocurrency mining pool domains"
        author = "CrashLab Security Team"
        severity = "medium"
        category = "cryptominer"
    strings:
        $pool1 = "xmr.pool" ascii wide nocase
        $pool2 = "minexmr.com" ascii wide nocase
        $pool3 = "supportxmr.com" ascii wide nocase
        $pool4 = "xmrpool.eu" ascii wide nocase
        $pool5 = "moneroocean.stream" ascii wide nocase
        $pool6 = "nanopool.org" ascii wide nocase
        $pool7 = "ethermine.org" ascii wide nocase
        $pool8 = "f2pool.com" ascii wide nocase
        $pool9 = "antpool.com" ascii wide nocase
        $pool10 = "slushpool.com" ascii wide nocase
        $pool11 = "btc.com" ascii wide nocase
        $pool12 = "viabtc.com" ascii wide nocase
        $pool13 = "pool.btc.com" ascii wide nocase
    condition:
        any of them
}

rule Hidden_Miner_Behavior {
    meta:
        description = "Behavioral indicators of hidden miners"
        author = "CrashLab Security Team"
        severity = "medium"
        category = "cryptominer"
    strings:
        $hide1 = "hide" ascii wide nocase
        $hide2 = "stealth" ascii wide nocase
        $hide3 = "background" ascii wide nocase
        $persist1 = "persist" ascii wide nocase
        $persist2 = "autostart" ascii wide nocase
        $persist3 = "startup" ascii wide nocase
        $elevate1 = "elevate" ascii wide nocase
        $elevate2 = "admin" ascii wide nocase
        $elevate3 = "root" ascii wide nocase
    condition:
        3 of ($hide*, $persist*, $elevate*)
}