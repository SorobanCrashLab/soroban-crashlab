/*
 * YARA Rules: Packer Detection
 * 
 * Detects common executable packers used to obfuscate malware.
 * These rules identify packed binaries that may hide malicious code.
 */

rule UPX_Packed {
    meta:
        description = "UPX packer detection"
        author = "CrashLab Security Team"
        severity = "medium"
        category = "packer"
        reference = "https://upx.github.io/"
    strings:
        $upx1 = "UPX!" ascii wide
        $upx2 = "UPX0" ascii wide
        $upx3 = "UPX1" ascii wide
        $upx4 = "UPX2" ascii wide
        $upx5 = { 55 50 58 21 } // "UPX!" in little-endian
    condition:
        any of them
}

rule ASPack_Packed {
    meta:
        description = "ASPack packer detection"
        author = "CrashLab Security Team"
        severity = "medium"
        category = "packer"
        reference = "http://www.aspack.com/"
    strings:
        $aspack1 = "ASPack" ascii wide
        $aspack2 = "aSPack" ascii wide
        $aspack3 = ".aspack" ascii wide
    condition:
        any of them
}

rule MPRESS_Packed {
    meta:
        description = "MPRESS packer detection"
        author = "CrashLab Security Team"
        severity = "medium"
        category = "packer"
        reference = "http://www.matcode.com/mpress.htm"
    strings:
        $mpress1 = "MPRESS" ascii wide
        $mpress2 = ".mpress" ascii wide
        $mpress3 = "MPRESS v" ascii wide
    condition:
        any of them
}

rule PECompact_Packed {
    meta:
        description = "PECompact packer detection"
        author = "CrashLab Security Team"
        severity = "medium"
        category = "packer"
        reference = "https://www.bitsum.com/pecompact.php"
    strings:
        $pec1 = "PECompact" ascii wide
        $pec2 = ".pec2" ascii wide
        $pec3 = "PEC2" ascii wide
    condition:
        any of them
}

rule FSG_Packed {
    meta:
        description = "FSG packer detection"
        author = "CrashLab Security Team"
        severity = "medium"
        category = "packer"
    strings:
        $fsg1 = "FSG!" ascii wide
        $fsg2 = "FSG v" ascii wide
    condition:
        any of them
}

rule Petite_Packed {
    meta:
        description = "Petite packer detection"
        author = "CrashLab Security Team"
        severity = "medium"
        category = "packer"
    strings:
        $petite1 = "Petite" ascii wide
        $petite2 = ".petite" ascii wide
    condition:
        any of them
}

rule Themida_Packed {
    meta:
        description = "Themida/WinLicense packer detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "packer"
        reference = "https://www.oreans.com/themida.php"
    strings:
        $themida1 = "Themida" ascii wide
        $themida2 = "WinLicense" ascii wide
        $themida3 = ".themida" ascii wide
    condition:
        any of them
}

rule VMProtect_Packed {
    meta:
        description = "VMProtect packer detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "packer"
        reference = "https://vmpsoft.com/"
    strings:
        $vmprotect1 = "VMProtect" ascii wide
        $vmprotect2 = ".vmp" ascii wide
        $vmprotect3 = "VMPROTECT" ascii wide
    condition:
        any of them
}

rule Enigma_Packed {
    meta:
        description = "Enigma Protector packer detection"
        author = "CrashLab Security Team"
        severity = "high"
        category = "packer"
        reference = "https://enigmaprotector.com/"
    strings:
        $enigma1 = "Enigma" ascii wide
        $enigma2 = ".enigma" ascii wide
    condition:
        any of them
}

rule Generic_Packer_Indicators {
    meta:
        description = "Generic packer indicators (entropy, section names)"
        author = "CrashLab Security Team"
        severity = "low"
        category = "packer"
    strings:
        $upx_section = "UPX" ascii
        $aspack_section = "ASPack" ascii
        $mpress_section = "MPRESS" ascii
        $themida_section = "Themida" ascii
        $vmprotect_section = "VMProtect" ascii
        $enigma_section = "Enigma" ascii
        $packed_section = { 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 }
    condition:
        any of ($upx_section, $aspack_section, $mpress_section, $themida_section, $vmprotect_section, $enigma_section) or
        (uint16(0) == 0x5A4D and $packed_section at pe.section_header_offset)
}